'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import SocialAuthButtons, { LastLoginBadge, rememberLogin, useLastLogin } from './SocialAuth';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';

export default function LoginClient({
  configured,
  nextPath,
  logoUrl = '',
  initialError = '',
  brand = 'store',
}: {
  configured: boolean;
  nextPath: string;
  logoUrl?: string;
  initialError?: string;
  brand?: 'store' | 'card'; // card = URBANLINKS 名片服務(同版型,換 Logo 與文案)
}) {
  const isCard = brand === 'card';
  const homeHref = isCard ? '/card' : '/';
  const [error, setError] = useState<string | null>(initialError || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const last = useLastLogin();

  const registerHref = `${brand === 'card' ? '/card/register' : '/register'}?next=${encodeURIComponent(nextPath)}`;

  async function signInWithPassword() {
    setError(null);
    setBusy('password');
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // 確保顧客資料有建檔(email 登入不會經過 /auth/callback)
      await fetch('/api/customers', { method: 'POST' }).catch(() => {});
      rememberLogin('email');
      window.location.href = nextPath;
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--c-surface)] text-[#242830]">
      <header className="sticky top-0 z-30 border-b border-[#e6e1d8] bg-[var(--c-surface)]">
        <nav className="mx-auto grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center px-5 py-4">
          <div className="flex items-center gap-5">
            {isCard ? null : (
              <>
                <Link href="/" aria-label="回首頁選單" className="text-[#717171]">
                  <IconMenu />
                </Link>
                <Link href="/" aria-label="搜尋" className="text-[#717171]">
                  <IconSearch />
                </Link>
              </>
            )}
          </div>
          <Link href={homeHref} aria-label="回首頁" className="justify-self-center px-2 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt={isCard ? 'URBANLINKS' : STORE_NAME} className={`${isCard ? '' : 'site-logo '}mx-auto h-8 w-auto object-contain sm:h-10`} />
            ) : (
              <span className="inline-block h-8 w-28 sm:h-10 sm:w-36" aria-hidden />
            )}
          </Link>
          <div className="flex items-center justify-end gap-5 text-[#717171]">
            {isCard ? null : (
              <>
                <IconUser />
                <IconBag />
              </>
            )}
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-md px-8 py-10">
        <div className="relative">
          <Link href={homeHref} aria-label="回首頁" className="absolute left-0 top-1 text-2xl leading-none text-[#717171]">
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
                className="w-full border-0 border-b border-[#dedede] px-0 py-3 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[var(--c-gold)]"
              />
              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密碼"
                  autoComplete="current-password"
                  className="w-full border-0 border-b border-[#dedede] px-0 py-3 pr-12 text-lg outline-none placeholder:text-[#9a9a9a] focus:border-[var(--c-gold)]"
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
              className="relative mt-8 w-full rounded bg-[var(--c-gold)] px-5 py-4 text-lg font-bold text-white transition hover:bg-[var(--c-gold)] disabled:opacity-50"
            >
              {last === 'email' ? <LastLoginBadge className="-right-2" /> : null}
              {busy === 'password' ? '登入中...' : isCard ? '開始建立名片' : '開始購物吧！'}
            </button>

            <div className="mt-10 flex items-center gap-3 text-sm text-[#7d7d7d]">
              <span className="h-px flex-1 bg-[#9b9b9b]" />
              <span>或使用其他方式</span>
              <span className="h-px flex-1 bg-[#9b9b9b]" />
            </div>

            <div className="mt-7">
              <SocialAuthButtons nextPath={nextPath} disabled={busy !== null} onBusy={setBusy} onError={setError} />
            </div>

            <section className="mt-20">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="text-4xl font-bold tracking-wide">還不是會員？</h2>
                <Link
                  href={registerHref}
                  className="shrink-0 rounded-full bg-[var(--c-gold)] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[var(--c-gold)]"
                >
                  註冊會員
                </Link>
              </div>
              {isCard ? (
                <div className="mt-9 text-lg leading-8 text-[#8a8a8a]">
                  <p>加入 URBANLINKS 即可：</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>免費建立你的個人名片</li>
                    <li>一個網址放進 IG、LINE、作品與商品</li>
                    <li>推薦 5 位朋友,送 1 個月 U Plus</li>
                  </ul>
                  <p className="mt-4 text-sm leading-6">用 LINE、Facebook、Google 登入會自動建立帳號;已經是 URBANITE 會員,用同一個帳號登入就可以。</p>
                </div>
              ) : (
                <div className="mt-9 text-lg leading-8 text-[#8a8a8a]">
                  <p>加入會員即可享：</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>每年生日購物金</li>
                    <li>會員專屬折扣</li>
                    <li>其他不定期優惠與驚喜</li>
                  </ul>
                </div>
              )}
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

