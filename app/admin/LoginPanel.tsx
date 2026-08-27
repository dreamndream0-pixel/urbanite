'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LoginPanel({ configured }: { configured: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function signIn(provider: 'google' | 'facebook') {
    setError(null);
    setBusy(provider);
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/admin` },
      });
      if (error) {
        setError(error.message);
        setBusy(null);
      }
      // 成功時會直接跳轉到社群登入頁
    } catch {
      setError('登入服務尚未設定完成');
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8f4] px-4 text-[#251b1f]">
      <div className="w-full max-w-md rounded-2xl border border-[#ead8d1] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#c84767]">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">商店後台登入</h1>
        <p className="mt-2 text-sm text-[#6c565b]">請使用管理員帳號登入以管理商品與訂單。</p>

        {!configured ? (
          <div className="mt-6 rounded-lg bg-[#fdf3e7] p-4 text-sm text-[#9a6a1f]">
            尚未設定 Supabase 連線,登入功能暫時停用。請先完成環境變數設定。
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <button
              onClick={() => signIn('google')}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-3 rounded-full border border-[#d7b9b0] bg-white px-5 py-3 font-semibold text-[#251b1f] transition hover:bg-[#f7ebe6] disabled:opacity-60"
            >
              {busy === 'google' ? '前往 Google…' : '使用 Google 登入'}
            </button>
            <button
              onClick={() => signIn('facebook')}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-[#1877f2] px-5 py-3 font-semibold text-white transition hover:bg-[#1568d6] disabled:opacity-60"
            >
              {busy === 'facebook' ? '前往 Facebook…' : '使用 Facebook 登入'}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-[#fdecec] px-4 py-2 text-sm text-[#c0392b]">{error}</p>
        )}

        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#6c565b]">
          ← 回到商店首頁
        </Link>
      </div>
    </main>
  );
}
