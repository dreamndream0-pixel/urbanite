'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUp, LayoutTemplate, LoaderCircle, Share2, X } from 'lucide-react';
import ProfileCardView from '@/app/components/ProfileCardView';
import { CARD_TEMPLATES, resolveTheme, type ProfileCard, type ProfileCardBlock } from '@/lib/profile-card';
import { FREE_TEMPLATE_KEYS, PENDING_IMPORT_KEY } from '@/lib/card-plan';
import { templateTheme } from '@/lib/card-template-match';
import { extractUrl, pastedUrl } from '@/lib/extract-url';
import styles from './hero.module.css';


type Preview = { source: string; url: string; card: ProfileCard; blocks: ProfileCardBlock[]; freeBlocks: number; template: string; allTemplates: boolean };
const PICKABLE = CARD_TEMPLATES.filter((t) => t.key !== 'blank');

// 官網介紹頁的透明氣泡:貼上其他名片服務的網址 → 先預覽搬家效果 → 確定搬家 → 註冊後自動帶入
export default function HeroImportBubble({ loggedIn }: { loggedIn: boolean }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Preview | null>(null);
  const [mine, setMine] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tpl, setTpl] = useState(''); // 預覽用的模板(預設 = 最接近原本頁面的)
  const [picking, setPicking] = useState(false);
  const [hint, setHint] = useState(false); // 「這裡有更多模板」提示
  const [toast, setToast] = useState('');
  const [refSlug, setRefSlug] = useState(''); // 分享連結帶上自己的推薦碼

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
    if (loggedIn) {
      fetch('/api/profile-card/referral', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => d?.slug && setRefSlug(String(d.slug)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 預覽打開時,在「更多模板」旁邊提示一下(點過一次就不再出現)
  useEffect(() => {
    if (!data) return;
    let seen = false;
    try {
      seen = localStorage.getItem('ul_tpl_hint_seen') === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    const show = setTimeout(() => setHint(true), 700);
    const hide = setTimeout(() => setHint(false), 9000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [data]);

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
    await readUrl(url);
  }

  async function readUrl(target: string, presetTpl = '') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/card-import/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: target }) });
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
      setTpl(PICKABLE.some((t) => t.key === presetTpl) ? presetTpl : d.template || '');
      setPicking(false);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取失敗');
    } finally {
      setBusy(false);
    }
  }

  // 分享這個預覽:對方打開就看到同一個預覽(含目前選的模板);登入時帶上自己的推薦碼
  async function share() {
    if (!data) return;
    const link = new URL('/card', window.location.origin);
    link.searchParams.set('move', data.url);
    if (tpl) link.searchParams.set('tpl', tpl);
    if (refSlug) link.searchParams.set('ref', refSlug);
    const text = `看看你的名片搬到 URBANLINKS 會是什麼樣子:${data.card.display_name || ''}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'URBANLINKS 一鍵搬家預覽', text, url: link.toString() });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return; // 使用者取消分享
    }
    try {
      await navigator.clipboard.writeText(link.toString());
      setToast('已複製分享連結,貼給對方就能看到這個預覽');
    } catch {
      setToast(link.toString());
    }
    setTimeout(() => setToast(''), 3500);
  }

  // 別人分享的預覽連結:/card?move=網址&tpl=模板 → 打開頁面就直接預覽
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const move = params.get('move');
    if (!move) return;
    Promise.resolve().then(() => {
      setUrl(move);
      void readUrl(move, params.get('tpl') ?? '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openTemplates() {
    setPicking((v) => !v);
    setHint(false);
    try {
      localStorage.setItem('ul_tpl_hint_seen', '1');
    } catch {
      // 無法儲存就算了
    }
  }

  function confirm() {
    if (!data || !mine) return;
    try {
      localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify({ url: data.url, at: Date.now(), template: tpl || 'auto' }));
    } catch {
      // 無法儲存(隱私模式):註冊後仍可在「我的名片」用一鍵搬家
    }
    window.location.href = loggedIn ? '/mycard' : '/card/register';
  }

  const linkCount = data?.blocks.length ?? 0;
  const locked = (key: string) => !data?.allTemplates && !FREE_TEMPLATE_KEYS.includes(key);
  const card = data ? { ...data.card, theme: (tpl && templateTheme(tpl)) || data.card.theme } : null;
  const tplName = PICKABLE.find((t) => t.key === tpl)?.name ?? '';
  const modal = data ? (
    // 滿版預覽:跟搬家後的名片頁一樣,下方固定一條確認列
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e5ded4] bg-[#faf7f2] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.18em] text-[#a99e8f]">一鍵搬家預覽 · {data.source}</p>
          <p className="truncate text-sm font-semibold text-[#1f1b19]">{tplName ? `套用「${tplName}」模板` : '這是搬到 URBANLINKS 後的樣子'}</p>
        </div>
        <button type="button" onClick={() => void share()} aria-label="分享這個預覽" title="分享這個預覽" className="flex shrink-0 items-center gap-1 rounded-full border border-[#d7c9bd] px-2.5 py-1.5 text-xs text-[#5f5852] hover:bg-[#efe8dd]">
          <Share2 size={14} />
          <span className="hidden sm:inline">分享</span>
        </button>
        <span className="relative shrink-0">
          <button
            type="button"
            onClick={openTemplates}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${picking ? 'bg-[#efe8dd] text-[#121b33]' : 'bg-[#121b33] text-[#dcbc84]'} ${hint ? 'ring-4 ring-[#dcbc84]/50' : ''}`}
          >
            <LayoutTemplate size={14} />
            更多模板
          </button>
          {/* 提示:箭頭指向「更多模板」 */}
          {hint ? (
            <button type="button" onClick={openTemplates} className="absolute right-0 top-full z-20 mt-2 flex flex-col items-end">
              <ArrowUp size={22} className="mr-6 animate-bounce text-[#121b33]" />
              <span className="whitespace-nowrap rounded-xl bg-[#121b33] px-3 py-2 text-xs font-medium text-[#dcbc84] shadow-[0_8px_20px_rgba(18,27,51,0.25)]">
                這裡有更多模板可以挑選 ✨
              </span>
            </button>
          ) : null}
        </span>
        <button type="button" onClick={() => setData(null)} className="hidden shrink-0 rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs text-[#5f5852] sm:block">
          換一個網址
        </button>
        <button type="button" onClick={() => setData(null)} aria-label="關閉" className="shrink-0 rounded-full p-1.5 text-[#8a7f72] hover:bg-[#efe8dd]">
          <X size={18} />
        </button>
      </div>
      {toast ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 max-w-[90vw] -translate-x-1/2 break-all rounded-full bg-[#121b33] px-4 py-2 text-center text-xs text-[#dcbc84] shadow-lg">{toast}</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProfileCardView card={card!} blocks={data.blocks} products={{}} preview fullScreen />
      </div>
      {/* 更多模板:點一下就換預覽 */}
      {picking ? (
        <div className="shrink-0 border-t border-[#e5ded4] bg-white px-3 py-3">
          <div className="mb-2 flex items-center justify-between px-1 text-xs">
            <span className="font-semibold text-[#1f1b19]">選擇模板{data.template ? `(${PICKABLE.find((t) => t.key === data.template)?.name ?? ''} 最接近你原本的頁面)` : ''}</span>
            <button type="button" onClick={() => setPicking(false)} className="text-[#8a7f72]">收起</button>
          </div>
          <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PICKABLE.map((t) => {
              const th = resolveTheme(t.theme);
              const on = t.key === tpl;
              return (
                <button key={t.key} type="button" onClick={() => setTpl(t.key)} className="w-[76px] shrink-0 text-center">
                  <span
                    className={`relative flex h-[96px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 ${on ? 'border-[#121b33]' : 'border-transparent'}`}
                    style={{ background: th.bgType === 'gradient' ? `linear-gradient(180deg, ${th.bgColor}, ${th.bgColor2})` : th.bgColor, boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
                  >
                    <span className="h-5 w-5 rounded-full" style={{ background: th.textColor, opacity: 0.85 }} />
                    {[0, 1].map((i) => (
                      <span key={i} className="h-2.5 w-12" style={{ borderRadius: th.buttonShape === 'pill' ? 99 : th.buttonShape === 'rounded' ? 4 : 0, background: th.buttonFill === 'outline' ? 'transparent' : th.buttonColor, border: `1px solid ${th.buttonColor}` }} />
                    ))}
                    {locked(t.key) ? <span className="absolute right-1 top-1 rounded-full bg-[#121b33] px-1 text-[8px] font-bold text-[#dcbc84]">PLUS</span> : null}
                    {t.key === data.template ? <span className="absolute bottom-1 rounded-full bg-white/90 px-1 text-[8px] text-[#121b33]">最接近</span> : null}
                  </span>
                  <span className={`mt-1 block truncate text-[11px] ${on ? 'font-semibold text-[#121b33]' : 'text-[#5f5852]'}`}>{t.name}</span>
                </button>
              );
            })}
          </div>
          {tpl && locked(tpl) ? <p className="mt-1.5 px-1 text-[11px] text-[#6b4a1f]">「{tplName}」是 U Plus 模板,免費版搬家時會改用最接近的免費模板。</p> : null}
        </div>
      ) : null}
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
            onChange={(e) => setUrl(/s/.test(e.target.value.trim()) ? extractUrl(e.target.value) : e.target.value)}
            onPaste={(e) => {
              const pasted = pastedUrl(e.clipboardData);
              if (!pasted) return;
              e.preventDefault();
              setUrl(pasted);
            }}
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
