'use client';

import { useEffect, useState } from 'react';
import type { Provider } from '@supabase/supabase-js';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { getBrowserAuthOrigin } from '@/lib/site-url';

export type LoginMethod = 'line' | 'facebook' | 'google' | 'email';
const LAST_LOGIN_KEY = 'ul_last_login';

// 記住這台裝置上次用哪種方式登入 / 註冊(登入頁顯示「上次登入」)
export function rememberLogin(method: LoginMethod) {
  try {
    localStorage.setItem(LAST_LOGIN_KEY, method);
  } catch {
    // 無法儲存(隱私模式)就不顯示
  }
}

export function useLastLogin() {
  const [last, setLast] = useState<LoginMethod | ''>('');
  useEffect(() => {
    let value = '';
    try {
      value = localStorage.getItem(LAST_LOGIN_KEY) ?? '';
    } catch {
      value = '';
    }
    if (['line', 'facebook', 'google', 'email'].includes(value)) Promise.resolve().then(() => setLast(value as LoginMethod));
  }, []);
  return last;
}

// 「上次登入」小氣泡:壓在按鈕右上角(父層需 relative)
export function LastLoginBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`pointer-events-none absolute -right-3 -top-3 z-10 whitespace-nowrap rounded-full bg-[#121b33] px-2 py-0.5 text-[10px] font-semibold text-[#dcbc84] shadow-sm after:absolute after:-bottom-1 after:left-1/2 after:h-2 after:w-2 after:-translate-x-1/2 after:rotate-45 after:bg-[#121b33] after:content-[''] ${className}`}>
      上次登入
    </span>
  );
}

const PROVIDERS: { key: Exclude<LoginMethod, 'email'>; label: string }[] = [
  { key: 'line', label: 'LINE' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'google', label: 'Google' },
];

// LINE / Facebook / Google:第一次使用會自動建立帳號,所以登入與註冊共用
export default function SocialAuthButtons({
  nextPath,
  mode = 'login',
  disabled = false,
  onBusy,
  onError,
}: {
  nextPath: string;
  mode?: 'login' | 'register';
  disabled?: boolean;
  onBusy?: (provider: string | null) => void;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const last = useLastLogin();

  async function start(provider: Exclude<LoginMethod, 'email'>) {
    setBusy(provider);
    onBusy?.(provider);
    rememberLogin(provider);
    if (provider === 'line') {
      window.location.assign(`/auth/line/start?next=${encodeURIComponent(nextPath)}`);
      return;
    }
    try {
      const { error } = await createBrowserSupabase().auth.signInWithOAuth({
        provider: provider as Provider,
        options: { redirectTo: `${getBrowserAuthOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}` },
      });
      if (error) throw error;
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '登入服務尚未設定完成');
      setBusy(null);
      onBusy?.(null);
    }
  }

  return (
    <div className="flex items-center justify-center gap-5">
      {PROVIDERS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => void start(p.key)}
          disabled={disabled || busy !== null}
          aria-label={`使用 ${p.label} ${mode === 'register' ? '註冊' : '登入'}`}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--c-surface)] shadow-sm ring-1 ring-[#e8e3dc] transition hover:bg-[var(--c-bg)] disabled:opacity-50"
        >
          {mode === 'login' && last === p.key ? <LastLoginBadge /> : null}
          {p.key === 'line' ? <img src="/icons/social/line-color.png" alt="" className="h-[30px] w-[30px]" /> : p.key === 'facebook' ? <IconFacebook /> : <IconGoogle />}
        </button>
      ))}
    </div>
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
