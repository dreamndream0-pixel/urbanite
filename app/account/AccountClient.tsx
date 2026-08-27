'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Order } from '@/lib/types';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

export default function AccountClient({
  configured,
  userEmail,
  userName,
  orders,
}: {
  configured: boolean;
  userEmail: string | null;
  userName: string;
  orders: Order[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/account` },
    });
    if (error) setBusy(false);
  }

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.refresh();
  }

  // 未登入畫面
  if (!userEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f2ec] px-4 text-[#1f1b19]">
        <div className="w-full max-w-md rounded-2xl border border-[#e5ded4] bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">會員登入</h1>
          <p className="mt-2 text-sm text-[#6b6156]">登入後即可查看你的訂單紀錄。</p>
          {configured ? (
            <button
              onClick={signIn}
              disabled={busy}
              className="mt-6 w-full rounded-full border border-[#d7c9bd] bg-white px-5 py-3 font-semibold transition hover:bg-[#f2ebe3] disabled:opacity-60"
            >
              {busy ? '前往 Google…' : '使用 Google 登入'}
            </button>
          ) : (
            <p className="mt-6 rounded-lg bg-[#fdf3e7] p-4 text-sm text-[#9a6a1f]">
              登入服務尚未設定完成。
            </p>
          )}
          <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#6b6156]">
            ← 回到商店首頁
          </Link>
        </div>
      </main>
    );
  }

  // 已登入:會員中心
  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <header className="border-b border-[#e5ded4] bg-[#faf7f2]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#8a7f72]">我的帳號</p>
            <p className="mt-0.5 font-medium">{userName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-[#e5ded4] bg-white px-4 py-2 text-sm font-medium text-[#6b6156] hover:bg-[#efe8dd]"
            >
              繼續購物
            </Link>
            <button
              onClick={signOut}
              className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold">我的訂單</h1>
        {orders.length === 0 ? (
          <p className="mt-6 rounded-lg border border-[#e5ded4] bg-white p-8 text-center text-[#6b6156]">
            你還沒有訂單。<Link href="/" className="font-semibold text-[#c84767]">去逛逛 →</Link>
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-[#e5ded4] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{order.order_no}</p>
                    <p className="text-sm text-[#8a7f72]">
                      {order.created_at
                        ? new Date(order.created_at).toLocaleDateString('zh-TW')
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-[#f3ede4] px-3 py-1 text-sm font-semibold text-[#6b6156]">
                      {order.status}
                    </span>
                    <span className="font-semibold">{formatter.format(order.total)}</span>
                  </div>
                </div>
                <ul className="mt-3 border-t border-[#efe8dd] pt-3 text-sm text-[#6b6156]">
                  {order.items.map((it, i) => (
                    <li key={i} className="flex justify-between py-0.5">
                      <span>
                        {it.name} <span className="text-[#a99e8f]">({it.variant})</span> × {it.quantity}
                      </span>
                      <span>{formatter.format(it.price * it.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
