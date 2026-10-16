'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import { COLOR_FIELDS, cssVar, type ColorKey } from '@/lib/site-theme';
import { lockScroll } from '@/lib/scroll-lock';

// 視覺化配色:以消費者看到的畫面(首頁、商品頁、購物車)呈現,點畫面上的區塊就跳出懸浮視窗改那個位置用到的顏色。
// 每個可以改色的區塊標上 data-ck="顏色1,顏色2";點擊時由內往外收集所有區塊的顏色。
const LABEL = Object.fromEntries(COLOR_FIELDS.map((f) => [f.key, f])) as Record<ColorKey, (typeof COLOR_FIELDS)[number]>;
const HEX = /^#[0-9a-f]{6}$/i;

type Picked = { groups: { name: string; keys: ColorKey[] }[]; x: number; y: number; el: HTMLElement };

export default function ThemeVisualEditor({ colors, images = [], onChange, onClose }: {
  colors: Record<ColorKey, string>;
  images?: string[];
  onChange: (key: ColorKey, value: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [page, setPage] = useState<'home' | 'product' | 'cart'>('home');
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => lockScroll(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') (picked ? setPicked(null) : onClose()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, onClose]);

  function pick(e: MouseEvent) {
    e.preventDefault();
    const groups: Picked['groups'] = [];
    const seen = new Set<string>();
    let first: HTMLElement | null = null;
    for (let el = (e.target as HTMLElement).closest<HTMLElement>('[data-ck]'); el && frame.current?.contains(el); el = el.parentElement?.closest<HTMLElement>('[data-ck]') ?? null) {
      first ??= el;
      const keys = (el.dataset.ck ?? '').split(',').filter((k): k is ColorKey => k in LABEL && !seen.has(k));
      keys.forEach((k) => seen.add(k));
      if (keys.length) groups.push({ name: el.dataset.name ?? '區塊', keys });
    }
    if (!first || !groups.length) { setPicked(null); return; }
    setPicked({ groups, x: e.clientX, y: e.clientY, el: first });
  }

  const vars = Object.fromEntries(COLOR_FIELDS.map((f) => [cssVar(f.key), colors[f.key]])) as CSSProperties;
  const img = (i: number) => images[i % Math.max(1, images.length)];
  const products = [0, 1, 2, 3];

  // 懸浮視窗位置:點擊點附近,不超出畫面
  const pop = picked ? (() => {
    const w = Math.min(300, window.innerWidth - 24);
    const left = Math.max(12, Math.min(picked.x - w / 2, window.innerWidth - w - 12));
    const below = picked.y < window.innerHeight * 0.55;
    return { width: w, left, ...(below ? { top: Math.min(picked.y + 16, window.innerHeight - 120) } : { bottom: Math.max(12, window.innerHeight - picked.y + 16) }) };
  })() : null;
  const highlight = picked ? picked.el.getBoundingClientRect() : null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#2a2522]/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="在畫面上編輯配色">
      <div className="flex shrink-0 items-center gap-2 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">點畫面上的區塊來改顏色</p>
          <p className="truncate text-[11px] text-[#8a7f72]">這是顧客看到的畫面;改完記得到下方按「儲存草稿」或「發布官網」</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">完成</button>
      </div>
      <div className="flex shrink-0 justify-center gap-1 bg-[#f6f2ec] px-3 py-2">
        {([['home', '首頁'], ['product', '商品頁'], ['cart', '購物車']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setPage(k); setPicked(null); }} className={`rounded-full px-4 py-1.5 text-sm ${page === k ? 'bg-[#1f1b19] font-semibold text-white' : 'text-[#6b6156]'}`}>{label}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4" onScroll={() => setPicked(null)}>
        {/* 手機尺寸的畫面 */}
        <div
          ref={frame}
          onClick={pick}
          style={{ ...vars, background: 'var(--c-bg)', color: 'var(--c-text)' }}
          className="mx-auto w-full max-w-[390px] cursor-pointer overflow-hidden rounded-2xl shadow-2xl [&_[data-ck]]:transition-[outline] [&_[data-ck]:hover]:outline-2 [&_[data-ck]:hover]:outline-dashed [&_[data-ck]:hover]:outline-offset-[-2px] [&_[data-ck]:hover]:outline-[#3b82f6]"
          data-ck="bg" data-name="頁面背景"
        >
          {/* 頁首 */}
          <div data-ck="header,border,text" data-name="頁首" className="flex items-center justify-between border-b px-4 py-3" style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}>
            <span className="text-lg">☰</span>
            <span className="text-base font-bold tracking-[0.12em]">YOUR SHOP</span>
            <span className="flex items-center gap-2 text-base">♡ <span className="relative">🛒<span data-ck="sale" data-name="購物車數量" className="absolute -right-2 -top-1 rounded-full px-1 text-[9px] text-white" style={{ background: 'var(--c-sale)' }}>2</span></span></span>
          </div>

          {page === 'home' && (
            <>
              <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: 'var(--c-soft)' }} data-ck="soft" data-name="圖片底色">
                {img(0) ? <img src={img(0)} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div data-ck="header,border,text2" data-name="分類列" className="flex gap-4 overflow-hidden border-b px-4 py-3 text-xs" style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)', color: 'var(--c-text2)' }}>
                <span data-ck="brand" data-name="選取中的分類" className="shrink-0 border-b-2 pb-1 font-semibold" style={{ color: 'var(--c-brand)', borderColor: 'var(--c-brand)' }}>精選商品</span>
                <span className="shrink-0">上衣</span><span className="shrink-0">褲裝</span><span className="shrink-0">外套</span><span className="shrink-0">全部商品</span>
              </div>
              <div className="px-4 pb-5 pt-4">
                <p data-ck="text" data-name="標題文字" className="mb-3 text-lg font-semibold">精選商品</p>
                <div className="grid grid-cols-2 gap-3">
                  {products.map((i) => (
                    <div key={i} data-ck="card" data-name="商品卡" className="rounded-xl p-2" style={{ background: 'var(--c-card)', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                      <div className="aspect-[4/5] overflow-hidden rounded-lg" style={{ background: 'var(--c-surface)' }} data-ck="surface" data-name="商品圖底色">
                        {img(i + 1) ? <img src={img(i + 1)} alt="" className="h-full w-full object-contain" /> : null}
                      </div>
                      <p data-ck="text" data-name="商品名稱" className="mt-2 truncate text-xs font-semibold">城市印花 T-shirt</p>
                      <p data-ck="muted" data-name="提示文字" className="truncate text-[10px]" style={{ color: 'var(--c-muted)' }}>純棉 · 寬鬆版型</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs font-semibold">
                          <span data-ck="sale" data-name="特價" style={{ color: 'var(--c-sale)' }}>NT $590</span>{' '}
                          <span data-ck="muted" data-name="原價" className="font-normal line-through" style={{ color: 'var(--c-muted)' }}>790</span>
                        </span>
                        <span data-ck="button,buttonText" data-name="加入按鈕" className="flex h-6 w-6 items-center justify-center rounded-full text-xs" style={{ background: 'var(--c-button)', color: 'var(--c-button-text)' }}>＋</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {page === 'product' && (
            <div className="px-4 pb-6 pt-4">
              <div className="aspect-[4/5] overflow-hidden rounded-xl" style={{ background: 'var(--c-soft)' }} data-ck="soft" data-name="商品圖底色">
                {img(1) ? <img src={img(1)} alt="" className="h-full w-full object-contain" /> : null}
              </div>
              <p data-ck="sale" data-name="分類名稱" className="mt-4 text-[11px] font-semibold tracking-[0.15em]" style={{ color: 'var(--c-sale)' }}>TOPS</p>
              <p data-ck="text" data-name="商品名稱" className="text-lg font-medium">城市印花 T-shirt</p>
              <span data-ck="text2" data-name="次要文字" className="mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: 'color-mix(in srgb, var(--c-text2) 40%, transparent)' }}>現貨</span>
              <div data-ck="sale,text" data-name="促銷文字" className="mt-3 border-l-[3px] pl-2.5 text-xs" style={{ borderColor: 'var(--c-sale)' }}>全店消費滿 $2,000 免運費</div>
              <p className="mt-3 flex items-baseline gap-2">
                <span data-ck="sale" data-name="價格" className="text-lg font-bold" style={{ color: 'var(--c-sale)' }}>NT $590</span>
                <span data-ck="muted" data-name="原價" className="text-sm line-through" style={{ color: 'var(--c-muted)' }}>NT $790</span>
              </p>
              <p data-ck="muted" data-name="規格標題" className="mb-1.5 mt-3 text-xs" style={{ color: 'var(--c-muted)' }}>尺寸：M</p>
              <div className="flex gap-1.5">
                {['S', 'M', 'L', 'XL'].map((s) => (
                  <span key={s} data-ck={s === 'M' ? 'sale' : 'borderStrong,text'} data-name={s === 'M' ? '選取的規格' : '規格按鈕'} className="min-w-10 px-3 py-[7px] text-center text-xs font-semibold" style={s === 'M' ? { border: '1px solid var(--c-sale)', color: 'var(--c-sale)' } : { border: '0.5px solid var(--c-border-strong)' }}>{s}</span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <span data-ck="cartButton" data-name="加入購物車按鈕" className="py-2 text-center text-sm font-semibold text-white" style={{ background: 'var(--c-cart-button)' }}>加入購物車</span>
                <span data-ck="buyButton" data-name="立即購買按鈕" className="py-2 text-center text-sm font-semibold text-white" style={{ background: 'var(--c-buy-button)' }}>立即購買</span>
              </div>
              <p data-ck="gold" data-name="會員優惠" className="mt-3 text-center text-xs" style={{ color: 'var(--c-gold)' }}>會員再享 95 折</p>
            </div>
          )}

          {page === 'cart' && (
            <div className="p-3">
              <div data-ck="surface,border" data-name="購物車面板" className="rounded-xl border p-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
                <p data-ck="text" data-name="標題文字" className="text-base font-semibold">購物車(2)</p>
                {[0, 1].map((i) => (
                  <div key={i} className="mt-3 flex gap-3 border-b pb-3" style={{ borderColor: 'var(--c-border)' }}>
                    <div className="h-16 w-14 shrink-0 overflow-hidden rounded-md" style={{ background: 'var(--c-soft)' }} data-ck="soft" data-name="淡色底">
                      {img(i + 2) ? <img src={img(i + 2)} alt="" className="h-full w-full object-contain" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p data-ck="text" data-name="商品名稱" className="truncate text-sm">城市印花 T-shirt</p>
                      <p data-ck="text2" data-name="次要文字" className="text-xs" style={{ color: 'var(--c-text2)' }}>黑色 / M</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span data-ck="borderStrong" data-name="數量外框" className="rounded-full border px-2 text-xs" style={{ borderColor: 'var(--c-border-strong)' }}>－ 1 ＋</span>
                        <span className="text-sm font-semibold">NT $590</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div data-ck="soft,text2" data-name="小計區" className="mt-3 rounded-lg p-3 text-xs" style={{ background: 'var(--c-soft)', color: 'var(--c-text2)' }}>
                  <p className="flex justify-between"><span>小計</span><span>NT $1,180</span></p>
                  <p className="mt-1 flex justify-between"><span>運費</span><span data-ck="sale" data-name="提醒文字" style={{ color: 'var(--c-sale)' }}>再買 NT $820 免運</span></p>
                </div>
                <span data-ck="button,buttonText" data-name="結帳按鈕" className="mt-3 block rounded-full py-2.5 text-center text-sm font-semibold" style={{ background: 'var(--c-button)', color: 'var(--c-button-text)' }}>前往結帳</span>
                <span data-ck="borderStrong,text" data-name="外框按鈕" className="mt-2 block rounded-full border py-2.5 text-center text-sm" style={{ borderColor: 'var(--c-border-strong)' }}>繼續購物</span>
              </div>
            </div>
          )}

          {/* 頁尾 */}
          <div data-ck="header,border,muted" data-name="頁尾" className="border-t px-4 py-4 text-center text-[11px]" style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
            關於我們 · 顧客服務 · 購物說明<br />© YOUR SHOP
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-white/80">提示:點不同位置會列出那裡用到的所有顏色,由內往外排列</p>
      </div>

      {/* 選取的區塊外框 */}
      {highlight && <div className="pointer-events-none fixed z-[91] rounded-sm outline-2 outline-[#3b82f6] outline" style={{ left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height }} />}

      {/* 懸浮編輯視窗 */}
      {picked && pop && (
        <div className="fixed z-[92] max-h-[60dvh] overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/10" style={pop} onClick={(e) => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{picked.groups[0].name}</p>
            <button type="button" onClick={() => setPicked(null)} aria-label="關閉" className="rounded-full p-1 hover:bg-[#f3ede4]"><X size={16} /></button>
          </div>
          {picked.groups.map((g, gi) => (
            <div key={gi} className={gi ? 'mt-2 border-t border-[#efe8dd] pt-2' : ''}>
              {gi > 0 && <p className="mb-1 text-[11px] text-[#a99e8f]">外層:{g.name}</p>}
              {g.keys.map((k) => (
                <ColorRow key={k} label={LABEL[k].label} hint={LABEL[k].hint} value={colors[k]} onChange={(v) => onChange(k, v)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorRow({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  // 打字中保留輸入的文字;沒在打字時顯示目前色碼
  const [typing, setTyping] = useState<string | null>(null);
  const text = typing ?? value;
  const setText = (v: string) => setTyping(v);
  return (
    <label className="flex items-center gap-2.5 py-1">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[#e5ded4] bg-white p-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        <span className="block truncate text-[10px] text-[#a99e8f]">{hint}</span>
      </span>
      <input
        value={text}
        onChange={(e) => { const v = e.target.value.trim(); setText(v); if (HEX.test(v)) onChange(v.toLowerCase()); }}
        onBlur={() => setTyping(null)}
        className="w-[86px] shrink-0 rounded-md border border-[#e5ded4] px-1.5 py-1 font-mono text-[11px] uppercase"
        aria-label={`${label}色碼`}
      />
    </label>
  );
}
