'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, LoaderCircle, X } from 'lucide-react';
import ProfileCardView from '@/app/components/ProfileCardView';
import type { ProfileCard, ProfileCardBlock } from '@/lib/profile-card';
import { PENDING_IMPORT_KEY } from '@/lib/card-plan';
import styles from './hero.module.css';


type Preview = { source: string; url: string; card: ProfileCard; blocks: ProfileCardBlock[]; freeBlocks: number };

// 官網介紹頁的透明氣泡:貼上其他名片服務的網址 → 先預覽搬家效果 → 確定搬家 → 註冊後自動帶入
export default function HeroImportBubble({ loggedIn }: { loggedIn: boolean }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Preview | null>(null);
  const [mine, setMine] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  // 預覽開著時鎖住背景捲動,Esc 關閉
  useEffect(() => {
    if (!data) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setData(null);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [data]);

  async function read(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/card-import/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '讀取失敗');
      // 有些平台(例如 LINKGOODS)不讓其他網站直接顯示圖片:預覽時不送來源網址
      if (!document.querySelector('meta[name="referrer"]')) {
        const meta = document.createElement('meta');
        meta.name = 'referrer';
        meta.content = 'no-referrer';
        document.head.appendChild(meta);
      }
      setMine(false);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取失敗');
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!data || !mine) return;
    try {
      localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify({ url: data.url, at: Date.now() }));
    } catch {
      // 無法儲存(隱私模式):註冊後仍可在「我的名片」用一鍵搬家
    }
    window.location.href = loggedIn ? '/mycard' : '/card/register';
  }

  const linkCount = data?.blocks.length ?? 0;
  const modal = data ? (
    // 滿版預覽:跟搬家後的名片頁一樣,下方固定一條確認列
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e5ded4] bg-[#faf7f2] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.18em] text-[#a99e8f]">一鍵搬家預覽 · {data.source}</p>
          <p className="truncate text-sm font-semibold text-[#1f1b19]">這是搬到 URBANLINKS 後的樣子</p>
        </div>
        <button type="button" onClick={() => setData(null)} className="shrink-0 rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs text-[#5f5852]">
          換一個網址
        </button>
        <button type="button" onClick={() => setData(null)} aria-label="關閉" className="shrink-0 rounded-full p-1.5 text-[#8a7f72] hover:bg-[#efe8dd]">
          <X size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProfileCardView card={data.card} blocks={data.blocks} products={{}} preview fullScreen />
      </div>
      <div className="shrink-0 border-t border-[#e5ded4] bg-[#faf7f2] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs text-[#5f5852]">
              {linkCount} 個區塊、名稱、頭貼{data.card.tags.length ? '、標籤' : ''}{data.card.socials.length ? `、${data.card.socials.length} 個社群帳號` : ''},圖片會一起搬過來
              {linkCount > data.freeBlocks ? <span className="text-[#6b4a1f]">(免費版先搬前 {data.freeBlocks} 個,升級 U Plus 全部搬)</span> : null}
            </p>
            <label className="flex items-start gap-2 text-xs leading-5 text-[#5f5852]">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="mt-0.5" />
              這是我自己的頁面,我有權使用上面的內容
            </label>
          </div>
          <div className="shrink-0 sm:w-56">
            <button
              type="button"
              onClick={confirm}
              disabled={!mine}
              className="w-full rounded-full bg-[#121b33] py-3 text-sm font-semibold text-[#dcbc84] transition hover:bg-[#1d2a4d] disabled:opacity-40"
            >
              確定搬家
            </button>
            <p className="mt-1 text-center text-[11px] text-[#a99e8f]">{loggedIn ? '會直接搬進你的名片' : '下一步建立帳號,完成後自動搬進名片'}</p>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <form className={styles.urlBubble} onSubmit={read}>
        <label className={styles.importField}>
          <small>一鍵搬家 · 貼上你現在的名片網址</small>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="linktr.ee/yourname"
            inputMode="url"
            autoComplete="off"
            aria-label="貼上 Linktree、Portaly、LINKGOODS 等個人頁網址"
          />
          {error ? <em>{error}</em> : null}
        </label>
        <button type="submit" disabled={busy} aria-label="預覽搬家效果">
          {busy ? <LoaderCircle className={styles.spin} /> : <ArrowRight />}
        </button>
      </form>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
