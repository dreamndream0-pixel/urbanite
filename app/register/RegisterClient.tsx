'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { getBrowserAuthOrigin } from '@/lib/site-url';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';

export default function RegisterClient({
  configured,
  nextPath,
  logoUrl = '',
}: {
  configured: boolean;
  nextPath: string;
  logoUrl?: string;
}) {
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

  async function syncCustomerAndGo() {
    await fetch('/api/customers', { method: 'POST' }).catch(() => {});
    window.location.href = nextPath;
  }

  async function registerEmail() {
    setError(null);
    setNotice(null);
    if (!email || !password) {
      setError('請輸入 Email 與密碼');
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name || email },
          emailRedirectTo: `${getBrowserAuthOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) throw error;
      if (data.session) {
        await syncCustomerAndGo();
      } else {
        setNotice('註冊信已寄出，請到信箱點擊連結完成驗證後即可登入。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '註冊失敗');
    } finally {
      setBusy(false);
    }
  }

  async function registerPhoneStart() {
    setError(null);
    setNotice(null);
    if (!phone || !password) {
      setError('請輸入手機號碼與密碼');
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.auth.signUp({
        phone,
        password,
        options: { data: { name: name || phone } },
      });
      if (error) throw error;
      if (data.session) {
        await syncCustomerAndGo();
      } else {
        setOtpSent(true);
        setNotice('驗證碼已發送到你的手機，請輸入驗證碼完成註冊。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '手機註冊尚未設定完成（需在 Supabase 開啟簡訊驗證）');
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone() {
    setError(null);
    if (!otp) {
      setError('請輸入驗證碼');
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
      if (error) throw error;
      await syncCustomerAndGo();
    } catch (err) {
      setError(err instanceof Error ? err.message : '驗證失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#242830]">
      <header className="sticky top-0 z-30 border-b border-[#e6e1d8] bg-white">
        <nav className="mx-auto grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center px-5 py-4">
          <div />
          <Link href="/" aria-label="回首頁" className="justify-self-center px-2 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt={STORE_NAME} className="mx-auto h-8 w-auto object-contain sm:h-10" />
            ) : (
              <span className="inline-block h-8 w-28 sm:h-10 sm:w-36" aria-hidden />
            )}
          </Link>
          <div />
        </nav>
      </header>

      <div className="mx-auto max-w-md px-8 py-10">
        <h1 className="text-center text-4xl font-bold tracking-wide">註冊會員</h1>

        {!configured ? (
          <div className="mt-6 rounded-lg bg-[#fdf3e7] p-4 text-sm text-[#9a6a1f]">
            尚未設定 Supabase 連線，註冊功能暫時停用。
          </div>
        ) : (
          <>
            {/* Email / 手機 左右切換 */}
            <div className="mt-8 grid grid-cols-2 rounded-full border border-[#e0d9d2] p-1">
              <button
                onClick={() => {
                  setTab('email');
                  setOtpSent(false);
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-full py-2.5 text-sm font-semibold transition ${
                  tab === 'email' ? 'bg-[#ada265] text-white' : 'text-[#8a8a8a]'
                }`}
              >
                Email 註冊
              </button>
              <button
                onClick={() => {
                  setTab('phone');
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-full py-2.5 text-sm font-semibold transition ${
                  tab === 'phone' ? 'bg-[#ada265] text-white' : 'text-[#8a8a8a]'
                }`}
              >
                手機註冊
              </button>
            </div>

            <div className="mt-8 space-y-8">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="姓名（選填）"
                className="w-full border-0 border-b border-[#dedede] px-0 py-3 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[#b5a66a]"
              />
              {tab === 'email' ? (
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="電子郵件"
                  autoComplete="email"
                  className="w-full border-0 border-b border-[#dedede] px-0 py-3 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[#b5a66a]"
                />
              ) : (
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="手機號碼（含國碼，如 +886912345678）"
                  autoComplete="tel"
                  disabled={otpSent}
                  className="w-full border-0 border-b border-[#dedede] px-0 py-3 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[#b5a66a] disabled:opacity-60"
                />
              )}
              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="設定密碼"
                  autoComplete="new-password"
                  disabled={otpSent}
                  className="w-full border-0 border-b border-[#dedede] px-0 py-3 pr-12 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[#b5a66a] disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-[#242830]"
                >
                  <IconEye closed={!showPassword} />
                </button>
              </div>
              {tab === 'phone' && otpSent && (
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="手機驗證碼"
                  inputMode="numeric"
                  className="w-full border-0 border-b border-[#dedede] px-0 py-3 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[#b5a66a]"
                />
              )}
            </div>

            {error && (
              <p className="mt-6 rounded-lg bg-[#fdecec] px-4 py-2 text-sm text-[#c0392b]">{error}</p>
            )}
            {notice && (
              <p className="mt-6 rounded-lg bg-[#e9f7ee] px-4 py-2 text-sm text-[#1f7a44]">{notice}</p>
            )}

            <button
              onClick={
                tab === 'email' ? registerEmail : otpSent ? verifyPhone : registerPhoneStart
              }
              disabled={busy}
              className="mt-8 w-full rounded bg-[#ada265] px-5 py-4 text-lg font-bold text-white transition hover:bg-[#9a9059] disabled:opacity-50"
            >
              {busy
                ? '處理中...'
                : tab === 'phone' && otpSent
                  ? '驗證並完成註冊'
                  : '註冊並開始購物'}
            </button>

            <p className="mt-8 text-center text-sm text-[#8a8a8a]">
              已經是會員？{' '}
              <Link href={loginHref} className="font-semibold text-[#ada265]">
                前往登入
              </Link>
            </p>
          </>
        )}

      </div>
    </main>
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
