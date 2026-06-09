/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db, getStorage } from '@/lib/db';
import { InviteDuration } from '@/lib/types';

export const runtime = 'edge';

const DURATIONS: InviteDuration[] = ['week', 'month', 'year'];

async function requireAdmin(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const config = await getConfig();
  if (authInfo.username === process.env.USERNAME) {
    return { username: authInfo.username, role: 'owner' as const, config };
  }

  const user = config.UserConfig.Users.find(
    (entry) => entry.username === authInfo.username
  );
  if (!user || user.role !== 'admin') {
    return {
      error: NextResponse.json({ error: '权限不足' }, { status: 401 }),
    };
  }

  return { username: authInfo.username, role: 'admin' as const, config };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const users = await db.getInviteUsers();
    const roleMap = new Map(
      auth.config.UserConfig.Users.map((user) => [user.username, user])
    );

    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        role: roleMap.get(user.username)?.role || 'user',
        banned: Boolean(roleMap.get(user.username)?.banned),
      })),
    });
  } catch (error) {
    console.error('获取邀请码列表失败:', error);
    return NextResponse.json({ error: '获取邀请码列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as { duration?: InviteDuration };
    if (!body.duration || !DURATIONS.includes(body.duration)) {
      return NextResponse.json({ error: '有效期参数错误' }, { status: 400 });
    }

    const user = await db.createInviteUser(body.duration);
    auth.config.UserConfig.Users.push({
      username: user.username,
      role: 'user',
    });

    const storage = getStorage();
    await storage.setAdminConfig(auth.config);

    return NextResponse.json({ user });
  } catch (error) {
    console.error('创建邀请码失败:', error);
    return NextResponse.json({ error: '创建邀请码失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      username?: string;
      duration?: InviteDuration;
      enabled?: boolean;
    };

    if (!body.username) {
      return NextResponse.json({ error: '缺少用户名' }, { status: 400 });
    }
    if (body.duration && !DURATIONS.includes(body.duration)) {
      return NextResponse.json({ error: '有效期参数错误' }, { status: 400 });
    }
    if (
      typeof body.enabled !== 'boolean' &&
      typeof body.duration === 'undefined'
    ) {
      return NextResponse.json({ error: '缺少更新内容' }, { status: 400 });
    }

    const user = await db.updateInviteUser(body.username, {
      duration: body.duration,
      enabled: body.enabled,
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('更新邀请码失败:', error);
    return NextResponse.json({ error: '更新邀请码失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as { username?: string };
    if (!body.username) {
      return NextResponse.json({ error: '缺少用户名' }, { status: 400 });
    }
    if (body.username === auth.username) {
      return NextResponse.json({ error: '不能删除自己' }, { status: 400 });
    }

    const storage = getStorage();
    await storage.deleteUser(body.username);
    auth.config.UserConfig.Users = auth.config.UserConfig.Users.filter(
      (user) => user.username !== body.username
    );

    await storage.setAdminConfig(auth.config);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('删除邀请码失败:', error);
    return NextResponse.json({ error: '删除邀请码失败' }, { status: 500 });
  }
}
