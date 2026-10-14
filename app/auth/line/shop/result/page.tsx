import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { getCurrentShop, isPlatformShop } from '@/lib/shop';
import { fetchBotInfo, getShopLineConfig } from '@/lib/shop-line';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'LINE 訂閱結果', robots: { index: false, follow: false }, referrer: 'no-referrer' };

// 綁定失敗時提供「加入官方帳號好友」連結(用 basicId 組 line.me 加好友網址)
async function addFriendUrl() {
  const shop = await getCurrentShop().catch(() => null);
  if (!shop || isPlatformShop(shop)) return null;
  const cfg = await getShopLineConfig(shop.id).catch(() => null);
  if (!cfg?.accessToken) return null;
  const info = await fetchBotInfo(cfg.accessToken).catch(() => null);
  return info?.basicId ? `https://line.me/R/ti/p/${encodeURIComponent(info.basicId)}` : null;
}

// A LINE webview may not have the storefront session. Never require login here.
export default async function ShopLineResult({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const success = ok === '1' && !error;
  const friendUrl = success ? null : await addFriendUrl();
  return <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
    {success ? <CheckCircle2 size={48} className="text-[#06C755]" aria-hidden="true" /> : <CircleAlert size={48} className="text-red-700" aria-hidden="true" />}
    <h1 className="mt-5 text-xl font-semibold">{success ? 'LINE 訂閱與綁定完成' : 'LINE 綁定未完成'}</h1>
    <p className="mt-3 text-sm leading-7 text-[var(--c-text2)]">{success ? '可回到官方 LINE 輸入「訂單查詢」，查看訂單狀態。不需要在這裡重新登入。' : error || '請回原本已登入的瀏覽器，重新點選訂閱 LINE 通知。'}</p>
    {success ? <p className="mt-3 text-sm leading-7 text-[var(--c-text2)]">關閉此視窗即可回到 LINE；原本網站重新整理後會顯示已綁定。</p> : null}
    {friendUrl ? <div className="mt-6 flex w-full flex-col gap-3">
      <a href={friendUrl} className="rounded-md bg-[#06C755] px-6 py-3 text-sm font-semibold text-white">① 加入官方帳號好友</a>
      <Link href="/auth/line/shop/start" prefetch={false} className="rounded-md border border-[var(--c-border)] px-6 py-3 text-sm font-semibold">② 加好友後，重新訂閱</Link>
    </div> : null}
    <Link href="/" className="mt-6 text-sm text-[var(--c-text2)] underline">返回商店</Link>
  </main>;
}
