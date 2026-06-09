/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'edge';

// 读取存储类型环境变量，默认 localstorage
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';
const INVITE_CODE_RE = /^\d{6}$/;
const failedLoginAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // 生成签名
  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  // 转换为十六进制字符串
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证Cookie（带签名）
async function generateAuthCookie(
  username?: string,
  password?: string,
  role?: 'owner' | 'admin' | 'user',
  includePassword = false
): Promise<string> {
  const authData: any = { role: role || 'user' };

  // 只在需要时包含 password
  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    // 使用密码作为密钥对用户名进行签名
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now(); // 添加时间戳防重放攻击
  }

  return encodeURIComponent(JSON.stringify(authData));
}

function getClientKey(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for') ||
    'unknown'
  );
}

function isRateLimited(req: NextRequest): boolean {
  const key = getClientKey(req);
  const current = failedLoginAttempts.get(key);
  if (!current) return false;
  if (Date.now() > current.resetAt) {
    failedLoginAttempts.delete(key);
    return false;
  }
  return current.count >= 10;
}

function recordFailedLogin(req: NextRequest) {
  const key = getClientKey(req);
  const current = failedLoginAttempts.get(key);
  if (!current || Date.now() > current.resetAt) {
    failedLoginAttempts.set(key, {
      count: 1,
      resetAt: Date.now() + 10 * 60 * 1000,
    });
    return;
  }
  failedLoginAttempts.set(key, {
    count: current.count + 1,
    resetAt: current.resetAt,
  });
}

function clearFailedLogin(req: NextRequest) {
  failedLoginAttempts.delete(getClientKey(req));
}

function setAuthCookie(
  response: NextResponse,
  cookieValue: string,
  expires: Date
) {
  response.cookies.set('auth', cookieValue, {
    path: '/',
    expires,
    sameSite: 'lax',
    httpOnly: false,
    secure: false,
  });
}

function defaultExpires(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  return expires;
}

export async function POST(req: NextRequest) {
  try {
    if (isRateLimited(req)) {
      return NextResponse.json(
        { error: '登录尝试过多，请稍后再试' },
        { status: 429 }
      );
    }

    // 本地 / localStorage 模式——仅校验固定密码
    if (STORAGE_TYPE === 'localstorage') {
      const envPassword = process.env.PASSWORD;

      // 未配置 PASSWORD 时直接放行
      if (!envPassword) {
        const response = NextResponse.json({ ok: true });

        // 清除可能存在的认证cookie
        response.cookies.set('auth', '', {
          path: '/',
          expires: new Date(0),
          sameSite: 'lax', // 改为 lax 以支持 PWA
          httpOnly: false, // PWA 需要客户端可访问
          secure: false, // 根据协议自动设置
        });

        return response;
      }

      const { password } = await req.json();
      if (typeof password !== 'string') {
        return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
      }

      if (password !== envPassword) {
        return NextResponse.json(
          { ok: false, error: '密码错误' },
          { status: 401 }
        );
      }

      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        undefined,
        password,
        'user',
        true
      ); // localstorage 模式包含 password
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // 7天过期

      setAuthCookie(response, cookieValue, expires);
      clearFailedLogin(req);

      return response;
    }

    const body = await req.json();
    const { username, password, inviteCode } = body as {
      username?: string;
      password?: string;
      inviteCode?: string;
    };

    if (typeof inviteCode === 'string') {
      const normalizedInviteCode = inviteCode.trim();
      if (!INVITE_CODE_RE.test(normalizedInviteCode)) {
        recordFailedLogin(req);
        return NextResponse.json(
          { error: '邀请码无效或已失效' },
          { status: 401 }
        );
      }

      const inviteUser = await db.findUserByInviteCode(normalizedInviteCode);
      if (!inviteUser) {
        recordFailedLogin(req);
        return NextResponse.json(
          { error: '邀请码无效或已失效' },
          { status: 401 }
        );
      }

      const config = await getConfig();
      const user = config.UserConfig.Users.find(
        (u) => u.username === inviteUser.username
      );
      if (user && user.banned) {
        recordFailedLogin(req);
        return NextResponse.json(
          { error: '邀请码无效或已失效' },
          { status: 401 }
        );
      }

      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        inviteUser.username,
        undefined,
        user?.role || 'user',
        false
      );
      const inviteExpires = new Date(inviteUser.invite_expires_at * 1000);
      const expires =
        inviteExpires.getTime() < defaultExpires().getTime()
          ? inviteExpires
          : defaultExpires();

      setAuthCookie(response, cookieValue, expires);
      clearFailedLogin(req);
      return response;
    }

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    // 可能是站长，直接读环境变量
    if (
      username === process.env.USERNAME &&
      password === process.env.PASSWORD
    ) {
      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        username,
        password,
        'owner',
        false
      ); // 数据库模式不包含 password
      setAuthCookie(response, cookieValue, defaultExpires());
      clearFailedLogin(req);

      return response;
    } else if (username === process.env.USERNAME) {
      recordFailedLogin(req);
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    recordFailedLogin(req);
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
  } catch (error) {
    console.error('登录接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
