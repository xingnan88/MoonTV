/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { checkForUpdates, CURRENT_VERSION, UpdateStatus } from '@/lib/version';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (_) {
        // ignore update check failures
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <button
      onClick={() =>
        window.open('https://github.com/senshinya/MoonTV', '_blank')
      }
      className='absolute bottom-4 left-1/2 flex -translate-x-1/2 transform cursor-pointer items-center gap-2 text-xs text-gray-500 transition-colors dark:text-gray-400'
    >
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${
            updateStatus === UpdateStatus.HAS_UPDATE
              ? 'text-yellow-600 dark:text-yellow-400'
              : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-green-600 dark:text-green-400'
              : ''
          }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='h-3.5 w-3.5' />
              <span className='text-xs font-semibold'>有新版本</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='h-3.5 w-3.5' />
              <span className='text-xs font-semibold'>已是最新</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inviteCode, setInviteCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { siteName } = useSite();
  const inviteCodeValid = /^\d{6}$/.test(inviteCode);

  const redirectAfterLogin = () => {
    const redirect = searchParams.get('redirect') || '/';
    router.replace(redirect);
  };

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(inviteCode)) {
      setError('请输入 6 位数字邀请码');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });

      if (res.ok) {
        redirectAfterLogin();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '邀请码无效或已失效');
      }
    } catch (_) {
      setError('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!username || !password) {
      setError('请输入管理员账号和密码');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        redirectAfterLogin();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '用户名或密码错误');
      }
    } catch (_) {
      setError('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='relative flex min-h-screen items-center justify-center overflow-hidden px-4'>
      <div className='absolute right-4 top-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 p-10 shadow-2xl backdrop-blur-xl dark:border dark:border-zinc-800 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40'>
        <h1 className='mb-2 bg-clip-text text-center text-3xl font-extrabold tracking-tight text-green-600 drop-shadow-sm'>
          {siteName}
        </h1>
        <p className='mb-8 text-center text-sm text-gray-500 dark:text-gray-400'>
          {adminMode ? '管理员登录' : '输入 6 位邀请码'}
        </p>

        {!adminMode ? (
          <form onSubmit={handleInviteSubmit} className='space-y-6'>
            <div>
              <label htmlFor='inviteCode' className='sr-only'>
                邀请码
              </label>
              <input
                id='inviteCode'
                type='tel'
                inputMode='numeric'
                pattern='[0-9]*'
                maxLength={6}
                autoComplete='one-time-code'
                className='block w-full rounded-lg border-0 bg-white/60 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-gray-900 shadow-sm ring-1 ring-white/60 backdrop-blur placeholder:tracking-normal placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-zinc-800/60 dark:text-gray-100 dark:ring-white/20 dark:placeholder:text-gray-400'
                placeholder='6 位邀请码'
                value={inviteCode}
                onInput={(e) => {
                  const target = e.currentTarget;
                  target.value = target.value.replace(/\D/g, '').slice(0, 6);
                }}
                onChange={(e) =>
                  setInviteCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
              />
            </div>

            {error && (
              <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
            )}

            <button
              type='submit'
              disabled={!inviteCodeValid || loading}
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminSubmit} className='space-y-6'>
            <input
              type='text'
              autoComplete='username'
              className='block w-full rounded-lg border-0 bg-white/60 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-white/60 backdrop-blur placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-zinc-800/60 dark:text-gray-100 dark:ring-white/20 dark:placeholder:text-gray-400'
              placeholder='管理员账号'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type='password'
              autoComplete='current-password'
              className='block w-full rounded-lg border-0 bg-white/60 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-white/60 backdrop-blur placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-zinc-800/60 dark:text-gray-100 dark:ring-white/20 dark:placeholder:text-gray-400'
              placeholder='管理员密码'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
            )}

            <button
              type='submit'
              disabled={!username || !password || loading}
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '登录中...' : '管理员登录'}
            </button>
          </form>
        )}

        <button
          type='button'
          onClick={() => {
            setAdminMode((value) => !value);
            setError(null);
          }}
          className='mt-6 w-full text-center text-sm text-gray-500 underline-offset-4 hover:text-green-600 hover:underline dark:text-gray-400'
        >
          {adminMode ? '返回邀请码登录' : '管理员登录'}
        </button>
      </div>

      <VersionDisplay />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
