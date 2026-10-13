import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, CircleAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'LINE 訂閱結果', robots: { index: false, follow: false }, referrer: 'no-referrer' };

// A LINE webview may not have the storefront session. Never require login here.
export default async function ShopLineResult({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const success = ok === '1' && !error;
  return <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
    {success ? <CheckCircle2 size={48} className="text-[#06C755]" aria-hidden="true" /> : <CircleAlert size={48} className="text-red-700" aria-hidden="true" />}
    <h1 className="mt-5 text-xl font-semibold">{success ? 'LINE 訂閱與綁定完成' : 'LINE 綁定未完成'}</h1>
    <p className="mt-3 text-sm leading-7 text-[var(--c-text2)]">{success ? '可回到官方 LINE 輸入「訂單查詢」，查看訂單狀態。不需要在這裡重新登入。' : error || '請回原本已登入的瀏覽器，重新點選訂閱 LINE 通知。'}</p>
    <p className="mt-3 text-sm leading-7 text-[var(--c-text2)]">{success ? '關閉此視窗即可回到 LINE；原本網站重新整理後會顯示已綁定。' : '若 LINE 開啟不同瀏覽器，請回到原本的會員頁面再試一次。'}</p>
    <Link href="/" className="mt-6 rounded-md border border-[var(--c-border)] px-6 py-3 text-sm">返回商店</Link>
  </main>;
}
