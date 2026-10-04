import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'LINE 綁定', robots: { index: false } };

// LINE 授權綁定完成頁:不需要登入(授權回來時可能在 LINE 內建瀏覽器開啟)
export default async function LineLinkedPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const success = ok === '1' && !error;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--c-bg)] px-5 py-12 text-[var(--c-text)]">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center shadow-sm">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white ${success ? 'bg-[#06C755]' : 'bg-[#c0392b]'}`}>
          {success ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          ) : (
            <span className="text-2xl font-bold">!</span>
          )}
        </div>
        <h1 className="mt-4 text-lg font-semibold">{success ? 'LINE 綁定完成' : 'LINE 綁定失敗'}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--c-text2)]">
          {success
            ? '回到官方 LINE 輸入「訂單查詢」「優惠券」「購物金」「會員資料」即可查詢。'
            : `${error || '請回到會員中心重新操作'}`}
        </p>
        <Link href="/account" className="mt-5 block rounded-full bg-[var(--c-button)] py-3 text-sm font-semibold text-[var(--c-button-text)]">
          前往會員中心
        </Link>
        <p className="mt-3 text-[11px] text-[var(--c-muted)]">若是在 LINE 裡開啟此頁,可直接關閉回到聊天室</p>
      </div>
    </main>
  );
}
