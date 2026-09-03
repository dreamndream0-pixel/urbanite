'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { getBrowserAuthOrigin } from '@/lib/site-url';
import type { Provider } from '@supabase/supabase-js';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';

export default function LoginClient({
  configured,
  nextPath,
  logoUrl = '',
  initialError = '',
}: {
  configured: boolean;
  nextPath: string;
  logoUrl?: string;
  initialError?: string;
}) {
  const [error, setError] = useState<string | null>(initialError || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const registerHref = `/register?next=${encodeURIComponent(nextPath)}`;

  async function signInWithPassword() {
    setError(null);
    setBusy('password');
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // 確保顧客資料有建檔(email 登入不會經過 /auth/callback)
      await fetch('/api/customers', { method: 'POST' }).catch(() => {});
      window.location.href = nextPath;
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
      setBusy(null);
    }
  }

  async function signIn(provider: 'line' | 'facebook' | 'google') {
    setError(null);
    setBusy(provider);
    try {
      const supabase = createBrowserSupabase();
      const authProvider = provider === 'line' ? 'custom:line' : provider;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: authProvider as Provider,
        options: {
          redirectTo: `${getBrowserAuthOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) {
        setError(error.message);
        setBusy(null);
      }
    } catch {
      setError('登入服務尚未設定完成');
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#242830]">
      <header className="sticky top-0 z-30 border-b border-[#e6e1d8] bg-white">
        <nav className="mx-auto grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center px-5 py-4">
          <div className="flex items-center gap-5">
            <Link href="/" aria-label="回首頁選單" className="text-[#717171]">
              <IconMenu />
            </Link>
            <Link href="/" aria-label="搜尋" className="text-[#717171]">
              <IconSearch />
            </Link>
          </div>
          <Link href="/" aria-label="回首頁" className="justify-self-center px-2 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt={STORE_NAME} className="mx-auto h-8 w-auto object-contain sm:h-10" />
            ) : (
              <span className="font-serif text-2xl italic tracking-wide sm:text-3xl">{STORE_NAME}</span>
            )}
          </Link>
          <div className="flex items-center justify-end gap-5 text-[#717171]">
            <IconUser />
            <IconBag />
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-md px-8 py-10">
        <div className="relative">
          <Link href="/" aria-label="回首頁" className="absolute left-0 top-1 text-2xl leading-none text-[#717171]">
            ←
          </Link>
          <h1 className="text-center text-4xl font-bold tracking-wide">登入</h1>
        </div>

        {!configured ? (
          <div className="mt-6 rounded-lg bg-[#fdf3e7] p-4 text-sm text-[#9a6a1f]">
            尚未設定 Supabase 連線,登入功能暫時停用。請先完成環境變數設定。
          </div>
        ) : (
          <>
            <div className="mt-12 space-y-8">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="電郵或手機號碼"
                autoComplete="email"
                className="w-full border-0 border-b border-[#dedede] px-0 py-3 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[#b5a66a]"
              />
              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密碼"
                  autoComplete="current-password"
                  className="w-full border-0 border-b border-[#dedede] px-0 py-3 pr-12 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[#b5a66a]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-[#242830]"
                >
                  <IconEye closed={!showPassword} />
                </button>
              </div>
            </div>

            <Link href="/" className="mt-8 inline-block text-sm text-[#4e9fea]">
              忘記密碼？
            </Link>

            <button
              onClick={signInWithPassword}
              disabled={busy !== null || !email || !password}
              className="mt-8 w-full rounded bg-[#ada265] px-5 py-4 text-lg font-bold text-white transition hover:bg-[#9a9059] disabled:opacity-50"
            >
              {busy === 'password' ? '登入中...' : '開始購物吧！'}
            </button>

            <div className="mt-10 flex items-center gap-3 text-sm text-[#7d7d7d]">
              <span className="h-px flex-1 bg-[#9b9b9b]" />
              <span>或使用其他方式</span>
              <span className="h-px flex-1 bg-[#9b9b9b]" />
            </div>

            <div className="mt-7 flex items-center justify-center gap-5">
              <ProviderButton
                label="LINE"
                busy={busy === 'line'}
                disabled={busy !== null}
                onClick={() => signIn('line')}
              >
                <IconLine />
              </ProviderButton>
              <ProviderButton
                label="Facebook"
                busy={busy === 'facebook'}
                disabled={busy !== null}
                onClick={() => signIn('facebook')}
              >
                <IconFacebook />
              </ProviderButton>
              <ProviderButton
                label="Google"
                busy={busy === 'google'}
                disabled={busy !== null}
                onClick={() => signIn('google')}
              >
                <IconGoogle />
              </ProviderButton>
            </div>

            <section className="mt-20">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="text-4xl font-bold tracking-wide">還不是會員？</h2>
                <Link
                  href={registerHref}
                  className="shrink-0 rounded-full bg-[#ada265] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#9a9059]"
                >
                  註冊會員
                </Link>
              </div>
              <div className="mt-9 text-lg leading-8 text-[#8a8a8a]">
                <p>加入會員即可享：</p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                  <li>每年生日購物金</li>
                  <li>會員專屬折扣</li>
                  <li>其他不定期優惠與驚喜</li>
                </ul>
              </div>
            </section>
          </>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-[#fdecec] px-4 py-2 text-sm text-[#c0392b]">{error}</p>
        )}

      </div>
    </main>
  );
}

function ProviderButton({
  label,
  busy,
  disabled,
  onClick,
  children,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={busy ? `前往 ${label}` : `使用 ${label} 登入`}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#e8e3dc] transition hover:bg-[#f7f5f2] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}

function IconBag() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8h12l-1 12H7L6 8z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
    </svg>
  );
}

function IconEye({ closed }: { closed: boolean }) {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {closed && <path d="M4 4l16 16" strokeLinecap="round" />}
    </svg>
  );
}

function IconLine() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="16" fill="#06C755" />
      <path fill="#fff" d="M25.5 14.4c0-4.3-4.3-7.8-9.5-7.8s-9.5 3.5-9.5 7.8c0 3.8 3.4 7 8 7.7.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .8.5 1-.4 5.2-3.1 7.1-5.3 1.3-1.4 1.9-3.1 1.9-5.1Z" />
      <path fill="#06C755" d="M11.2 12.2h1.1v4.1h-1.1v-4.1Zm2 0h1.1l1.7 2.4v-2.4h1.1v4.1H16l-1.7-2.4v2.4h-1.1v-4.1Zm4.8 0h3v1h-1.9v.6h1.7v1h-1.7v.6H21v1h-3v-4.2Z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="16" fill="#1877F2" />
      <path fill="#fff" d="M18.1 17.1h2.1l.4-2.8h-2.5v-1.5c0-.8.2-1.3 1.3-1.3h1.3V9c-.6-.1-1.3-.2-2-.2-2.1 0-3.6 1.3-3.6 3.7v1.8h-2.4v2.8h2.4V24h3v-6.9Z" />
    </svg>
  );
}

function IconGoogle() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <path fill="#4285F4" d="M29 16.3c0-.9-.1-1.6-.2-2.4H16v4.5h7.3c-.1 1.1-.9 2.8-2.5 3.9v2.9h4c2.4-2.2 4.2-5.4 4.2-8.9Z" />
      <path fill="#34A853" d="M16 29c3.5 0 6.4-1.1 8.5-3.1l-4-2.9c-1.1.7-2.5 1.2-4.5 1.2-3.4 0-6.3-2.3-7.3-5.4H4.6v3C6.7 26 11 29 16 29Z" />
      <path fill="#FBBC05" d="M8.7 18.8c-.3-.8-.4-1.7-.4-2.8s.1-2 .4-2.8v-3H4.6A13 13 0 0 0 3 16c0 2.1.5 4.1 1.6 5.8l4.1-3Z" />
      <path fill="#EA4335" d="M16 7.8c2 0 3.4.9 4.2 1.6l3.1-3C21.4 4.6 18.5 3 16 3 11 3 6.7 6 4.6 10.2l4.1 3C9.7 10.1 12.6 7.8 16 7.8Z" />
    </svg>
  );
}
