'use client';
import { useScrollLock } from '@/app/components/useScrollLock';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Eye, X, Monitor, Smartphone, Save, Send, ChevronRight, ChevronLeft, Palette } from 'lucide-react';
import ThemeVisualEditor from './ThemeVisualEditor';
import { STOREFRONT_TEMPLATES, resolveStorefront } from '@/lib/storefront-template';
import type { DesignCategory } from '@/app/components/StorefrontDesign';
import previewStyles from './site-theme-preview.module.css';
import StorefrontBlocks from '@/app/components/StorefrontBlocks';
import { ProductCard } from '@/app/components/Storefront';
import StorefrontBlockEditor from './StorefrontBlockEditor';
import { starterBlocks, switchTemplate, resolveBlocks, safeBlockUrl } from '@/lib/storefront-blocks';
import { editableSiteTheme } from '@/lib/site-theme-state';
import { isVisibleInStore } from '@/lib/product-status';
import type { Banner, CategoryImageStyle, Product } from '@/lib/types';
import { cssVar } from '@/lib/site-theme';
import {
  COLOR_FIELDS,
  LAYOUT_OPTIONS,
  resolveSiteTheme,
  SITE_TEMPLATES,
  type ColorKey,
  type SiteLayout,
  type SiteTheme,
} from '@/lib/site-theme';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

// 後台 系統設定 → 一般設定 → 網站外觀:6 種樣板+全部顏色選擇器+版面配置,即時預覽
export default function SiteThemeEditor({ initial, banners, onSaved, categoryImageStyle = 'circle', onCategoryImageStyle }: { initial: unknown; banners: Banner[]; onSaved?: (theme: unknown) => void; categoryImageStyle?: CategoryImageStyle; onCategoryImageStyle?: (style: CategoryImageStyle) => void }) {
  const [saved, setSaved] = useState<SiteTheme>(() => editableSiteTheme(initial));
  const [published, setPublished] = useState<SiteTheme>(() => resolveSiteTheme(initial));
  const [draft, setDraft] = useState<SiteTheme>(() => {
    const theme = editableSiteTheme(initial);
    const design = resolveStorefront(theme.storefront);
    return { ...theme, storefront: { ...design, blocks: design.blocks ?? starterBlocks(design) } };
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useScrollLock(previewOpen);
  useEffect(() => {
    if (!previewOpen) return;
    const dialog = previewDialog.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, [previewOpen]);
  const [previewCategories, setPreviewCategories] = useState<DesignCategory[]>([]);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  // Share the dashboard's live banner state instead of a cached, mount-only API snapshot.
  const previewBanners = banners;
  const bannerRatios = resolveSiteTheme(initial).bannerRatios;
  const previewImages = [...banners.filter((b) => b.active).map((b) => b.image), ...previewProducts.filter(isVisibleInStore).map((p) => p.image)].filter(Boolean);
  const design = draft.storefront ?? resolveStorefront(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const productsRes = await fetch('/api/products');
        const products: Product[] = productsRes.ok ? await productsRes.json() : [];
        const categoriesRes = await fetch('/api/categories');
        const categories: DesignCategory[] = categoriesRes.ok ? await categoriesRes.json() : [];
        if (active) {
          setPreviewCategories(categories.filter((c) => c.sort_order === undefined || c.sort_order >= 0));
          setPreviewProducts(products);
        }
      } catch { /* Preview assets are optional; saved settings remain editable. */ }
    }
    void load();
    return () => { active = false; };
  }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const unpublished = JSON.stringify(draft) !== JSON.stringify(published);
  const invalidLinks = design.blocks?.some((b) => [b.image, b.video, b.href].some((url) => !!url && !safeBlockUrl(url)));

  const pickLayout = (style: (typeof STOREFRONT_TEMPLATES)[number]['key'], on: boolean) => {
    if (on) return;
    const next = switchTemplate(design.blocks ?? [], design.style, style);
    setDraft({ ...draft, storefront: { ...design, enabled: true, style, blocks: next } });
  };
  const setColor = (key: ColorKey, value: string) => setDraft({ ...draft, template: 'custom', colors: { ...draft.colors, [key]: value } });
  const setLayout = (patch: Partial<SiteLayout>) => setDraft({ ...draft, template: 'custom', layout: { ...draft.layout, ...patch } });

  async function save(publish: boolean) {
    if (invalidLinks) { void uiAlert('請先修正板塊中的網址'); return; }
    if (publish && !(await uiConfirm('將目前模板與板塊發布至正式官網？'))) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publish ? { site_theme: draft } : { site_theme_draft: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      const next = editableSiteTheme(data.site_theme);
      setSaved(next);
      setDraft(next);
      onSaved?.(data.site_theme);
      if (publish) setPublished(next);
      void uiAlert(publish ? '已發布至官網。' : '草稿已儲存，正式官網尚未變更。');
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!(await uiConfirm('恢復成預設的經典米白配色與版面?'))) return;
    const t = SITE_TEMPLATES[0];
    setDraft({ ...draft, template: t.key, colors: { ...t.colors }, layout: { ...t.layout } });
  }

  return (
    <section className="rounded-xl border border-[#e5ded4] bg-white p-5 pb-28 shadow-sm">
      <fieldset disabled={saving || uploading} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">官網模板與外觀</h2>
          <p className="mt-1 text-xs text-[#8a7f72]" role="status">{dirty ? '有未儲存的變更' : unpublished ? '草稿已儲存，尚未發布' : '已發布'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reset} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm text-[#6b6156] hover:bg-[#f6f2ec]">恢復預設</button>
          <button type="button" onClick={() => void save(false)} disabled={saving || !dirty || invalidLinks} className="flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40"><Save size={16} />儲存草稿</button>
          <button type="button" onClick={() => void save(true)} disabled={saving || !unpublished || invalidLinks} className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"><Send size={16} />{saving ? '處理中...' : '發布官網'}</button>
        </div>
      </div>

      <div className="mt-5">
        <div className="space-y-6">
          <fieldset disabled={saving} className="min-w-0 space-y-5">
            <legend className="sr-only">官網模板</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">1. 選擇首頁排版</p>
              <label className="flex items-center gap-2 text-sm text-[#6b6156]">
                <input type="checkbox" checked={design.enabled} onChange={(e) => setDraft({ ...draft, storefront: { ...design, enabled: e.target.checked } })} />
                使用模板首頁{design.enabled ? '' : '(目前為原本的輪播首頁)'}
              </label>
            </div>
            <SwipeRow label="官網排版">
              {STOREFRONT_TEMPLATES.map((t) => {
                const on = design.enabled && design.style === t.key;
                const blocks = on ? resolveBlocks(design.blocks) ?? [] : starterBlocks({ style: t.key });
                return (
                  // 卡片內有真實商品卡(含按鈕),外層不能用 <button>,改用可聚焦的 div
                  <div
                    key={t.key}
                    tabIndex={0}
                    role="radio"
                    aria-checked={on}
                    aria-label={t.name}
                    onClick={() => pickLayout(t.key, on)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickLayout(t.key, on); } }}
                    className={`w-[172px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-xl border text-left transition sm:w-[196px] ${on ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/15' : 'border-[#e5ded4] hover:border-[#1f1b19]/30'}`}
                  >
                    {/* 用真實商品、分類、輪播圖縮小顯示這個排版 */}
                    <div className={`${previewStyles.preview} pointer-events-none h-64 overflow-hidden bg-[var(--c-bg)] text-[var(--c-text)] sm:h-72`} data-card={draft.layout.card} data-radius={draft.layout.radius} data-heading={draft.layout.heading} style={themeVars(draft)} aria-hidden="true">
                      <div className="origin-top-left" style={{ width: 390, transform: 'scale(var(--thumb-scale))' }}>
                        <StorefrontBlocks designStyle={t.key} categoryImageStyle={categoryImageStyle} blocks={blocks} banners={previewBanners} bannerRatios={bannerRatios} products={previewProducts} categories={previewCategories} images={previewImages} onCategory={() => {}} preview renderProduct={(product) => <ProductCard product={product} favorited={false} favoritePending={false} favoritesLoaded onFavoriteChange={() => {}} onAdd={() => {}} />} />
                      </div>
                    </div>
                    <div className="border-t border-[#efe8dd] bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{t.name}</span>
                        {on ? <span className="shrink-0 text-xs text-[#1f7a44]">使用中</span> : null}
                      </div>
                      <p className="truncate text-[11px] text-[#a99e8f]">{t.en}</p>
                    </div>
                  </div>
                );
              })}
            </SwipeRow>
            <p className="text-xs text-[#a99e8f]">左右滑動看更多排版。換排版會保留你改過的文字、圖片和商品設定;按畫面下方「預覽」可以看手機和電腦的樣子。</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                2. 分類樣式
                <select value={categoryImageStyle} onChange={(e) => onCategoryImageStyle?.(e.target.value as CategoryImageStyle)} className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-normal">
                  <option value="text">預設文字</option>
                  <option value="circle">圓形</option>
                  <option value="square">方形</option>
                  <option value="cutout">去背</option>
                </select>
              </label>
              <span className="text-xs text-[#a99e8f]">首頁分類列的樣式,選了立即套用。分類圖片在「商品及分類 → 分類管理」上傳。</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">3. 編輯首頁內容</p>
              <button type="button" onClick={async () => { if (await uiConfirm('把首頁內容恢復成這個排版的預設文字與板塊?')) setDraft({ ...draft, storefront: { ...design, blocks: starterBlocks(design) } }); }} className="text-xs text-[#8a7f72] underline">恢復此排版預設內容</button>
            </div>
            <StorefrontBlockEditor designStyle={design.style} blocks={design.blocks ?? []} onChange={(blocks) => setDraft({ ...draft, storefront: { ...design, blocks } })} categories={previewCategories} products={previewProducts} banners={previewBanners} onUploading={setUploading} />
          </fieldset>
          {/* 樣板 */}
          <div>
            <p className="mb-2 text-sm font-semibold">4. 配色樣板</p>
            <SwipeRow label="配色樣板">
              {SITE_TEMPLATES.map((t) => {
                const selected = draft.template === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDraft({ ...draft, template: t.key, colors: { ...t.colors }, layout: { ...t.layout } })}
                    className={`w-[150px] shrink-0 snap-start overflow-hidden rounded-xl border text-left transition sm:w-[170px] ${selected ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/15' : 'border-[#e5ded4] hover:border-[#1f1b19]/30'}`}
                  >
                    <div className="pointer-events-none h-52 overflow-hidden" aria-hidden="true">
                      <div className="origin-top-left" style={{ width: 300, transform: 'scale(var(--swatch-scale))' }}>
                        <StorePreview theme={{ template: t.key, colors: t.colors, layout: t.layout }} images={previewImages} compact />
                      </div>
                    </div>
                    <div className="border-t border-[#efe8dd] bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{t.name}</span>
                        {selected ? <span className="shrink-0 text-xs text-[#1f7a44]">使用中</span> : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[#a99e8f]">{t.note}</p>
                      <div className="mt-1.5 flex gap-1">
                        {(['bg', 'header', 'brand', 'sale', 'button'] as const).map((k) => <span key={k} className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: t.colors[k] }} />)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </SwipeRow>
            {draft.template === 'custom' ? <p className="mt-2 text-xs text-[#8a7f72]">目前為自訂配色</p> : null}
          </div>

          {/* 版面配置 */}
          <div className="space-y-4">
            <p className="text-sm font-semibold">5. 商品卡與字體</p>
            <OptionRow label="商品卡樣式" value={draft.layout.card} options={LAYOUT_OPTIONS.card} onChange={(v) => setLayout({ card: v })} />
            <OptionRow label="商品欄數" value={draft.layout.columns} options={LAYOUT_OPTIONS.columns} onChange={(v) => setLayout({ columns: v })} />
            <OptionRow label="圓角" value={draft.layout.radius} options={LAYOUT_OPTIONS.radius} onChange={(v) => setLayout({ radius: v })} />
            <OptionRow label="標題字體" value={draft.layout.heading} options={LAYOUT_OPTIONS.heading} onChange={(v) => setLayout({ heading: v })} />
            <OptionRow label="商品頁剩餘庫存數量" value={draft.layout.stock ?? 'hide'} options={LAYOUT_OPTIONS.stock} onChange={(v) => setLayout({ stock: v })} />
          </div>

          {/* 顏色 */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">6. 自訂顏色</p>
              <button type="button" onClick={() => setVisualOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">
                <Palette size={16} aria-hidden="true" />在畫面上點選改色
              </button>
            </div>
            <p className="mb-2 text-xs text-[#a99e8f]">打開顧客看到的首頁、商品頁、購物車畫面,點哪裡就改哪裡的顏色;也可以直接在下方逐項調整。</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-3 rounded-xl border border-[#efe8dd] px-3 py-2">
                  <input
                    type="color"
                    value={draft.colors[f.key]}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[#e5ded4] bg-white p-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{f.label}</span>
                    <span className="block truncate text-[11px] text-[#a99e8f]">{f.hint}</span>
                  </span>
                  <span className="font-mono text-xs uppercase text-[#a99e8f]">{draft.colors[f.key]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

      </div>
      </fieldset>
      <button type="button" onClick={() => setPreviewOpen(true)} aria-haspopup="dialog" className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-50 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-white/30 bg-neutral-600/75 px-6 py-3 text-base text-white shadow-lg backdrop-blur-md transition hover:bg-neutral-600/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-600">
        <Eye size={20} aria-hidden="true" />預覽
      </button>
      {visualOpen && <ThemeVisualEditor colors={draft.colors} images={previewImages} onChange={setColor} onClose={() => setVisualOpen(false)} />}
      <dialog ref={previewDialog} aria-labelledby="storefront-preview-title" onCancel={() => setPreviewOpen(false)} onClose={() => setPreviewOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }} style={{ maxWidth: previewDevice === 'mobile' ? 430 : 1200 }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-24px)] overflow-hidden rounded-lg border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
          <h2 id="storefront-preview-title" className="text-sm font-semibold">官網預覽</h2>
          <div className="flex gap-1" role="group" aria-label="預覽尺寸">
            <button type="button" title="手機預覽" aria-label="手機預覽" aria-pressed={previewDevice === 'mobile'} onClick={() => setPreviewDevice('mobile')} className="rounded-md p-2 aria-pressed:bg-neutral-200"><Smartphone size={18} /></button>
            <button type="button" title="桌面預覽" aria-label="桌面預覽" aria-pressed={previewDevice === 'desktop'} onClick={() => setPreviewDevice('desktop')} className="rounded-md p-2 aria-pressed:bg-neutral-200"><Monitor size={18} /></button>
          </div>
          <button type="button" autoFocus onClick={() => setPreviewOpen(false)} aria-label="關閉預覽" title="關閉預覽" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-neutral-100"><X size={20} /></button>
        </div>
          <div className={`${previewStyles.preview} max-h-[calc(90dvh-65px)] overflow-y-auto overflow-x-hidden overscroll-contain bg-[var(--c-bg)] text-[var(--c-text)]`} data-card={draft.layout.card} data-radius={draft.layout.radius} data-heading={draft.layout.heading} onClickCapture={(event) => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); }} style={Object.fromEntries(COLOR_FIELDS.map((f) => [cssVar(f.key), draft.colors[f.key]])) as CSSProperties}>
            {design.enabled ? <StorefrontBlocks designStyle={design.style} categoryImageStyle={categoryImageStyle} blocks={resolveBlocks(design.blocks) ?? []} banners={previewBanners} bannerRatios={bannerRatios} products={previewProducts} categories={previewCategories} images={previewImages} onCategory={() => {}} preview renderProduct={(product) => <ProductCard product={product} favorited={false} favoritePending={false} favoritesLoaded onFavoriteChange={() => {}} onAdd={() => {}} />} /> : <StorePreview theme={draft} images={previewImages} />}
          </div>
      </dialog>
    </section>
  );
}

const themeVars = (theme: SiteTheme) => Object.fromEntries(COLOR_FIELDS.map((f) => [cssVar(f.key), theme.colors[f.key]])) as CSSProperties;

// 左右滑動的卡片列:右側有漸層與箭頭提示還有內容,點箭頭往右(左)捲一張
function SwipeRow({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);
  const go = (dir: 1 | -1) => {
    const el = row.current;
    const card = el?.firstElementChild as HTMLElement | null;
    el?.scrollBy({ left: dir * ((card?.offsetWidth ?? 160) + 12), behavior: 'smooth' });
  };
  return (
    <div className="relative min-w-0" role="radiogroup" aria-label={label}>
      <div ref={row} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [--swatch-scale:0.5] [--thumb-scale:0.441] [scrollbar-width:none] sm:[--swatch-scale:0.567] sm:[--thumb-scale:0.503] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {edge.left && (
        <button type="button" onClick={() => go(-1)} aria-label="往左看" className="absolute left-0 top-0 flex h-[calc(100%-8px)] w-10 items-center justify-start bg-gradient-to-r from-white to-transparent pl-0.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#1f1b19] shadow-md ring-1 ring-black/5"><ChevronLeft size={18} /></span>
        </button>
      )}
      {edge.right && (
        <button type="button" onClick={() => go(1)} aria-label="往右看更多" className="absolute right-0 top-0 flex h-[calc(100%-8px)] w-12 items-center justify-end bg-gradient-to-l from-white via-white/70 to-transparent pr-0.5">
          <span className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-white/95 text-[#1f1b19] shadow-md ring-1 ring-black/5"><ChevronRight size={18} /></span>
        </button>
      )}
    </div>
  );
}

function OptionRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-[#8a7f72]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${value === o.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#5f5852] hover:border-[#1f1b19]/30'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 前台縮小示意:頁首、分類列、商品卡(依配色與版面配置)
function StorePreview({ theme, compact = false, images = [], hero }: { theme: SiteTheme; compact?: boolean; images?: string[]; hero?: ReactNode }) {
  const c = theme.colors;
  const l = theme.layout;
  const cols = l.columns === '1-3' ? 1 : 2;
  const cardRadius = l.radius === 'square' ? 0 : l.radius === 'round' ? 18 : 8;
  const imgRadius = l.radius === 'square' ? 0 : l.radius === 'round' ? 12 : 6;
  const serif = l.heading === 'serif' ? { fontFamily: "'Noto Serif TC', serif" } : undefined;
  const cardStyle: CSSProperties =
    l.card === 'plain'
      ? { background: 'transparent', padding: 0 }
      : l.card === 'bordered'
        ? { background: c.card, border: `1px solid ${c.border}`, padding: 8, borderRadius: cardRadius }
        : l.card === 'elevated'
          ? { background: c.card, boxShadow: '0 10px 24px rgba(0,0,0,0.1)', padding: 8, borderRadius: cardRadius }
          : { background: c.card, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 8, borderRadius: cardRadius };
  const items = compact ? [0, 1] : cols === 1 ? [0, 1] : [0, 1, 2, 3];
  const swatch = ['#d9cbb8', '#b7c4cf', '#d8b4b4', '#c9d3bf'];
  return (
    <div style={{ background: c.bg, color: c.text }}>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ background: c.header, borderBottom: `1px solid ${c.border}` }}>
        <span className="text-[13px]" style={{ color: c.text }}>☰</span>
        <span className="text-sm font-bold tracking-[0.08em]" style={serif}>urbanite</span>
        <span className="text-[13px]" style={{ color: c.text }}>⌂</span>
      </div>
      {hero}
      <div className="flex gap-3 px-3 py-2 text-[10px]" style={{ background: c.header, borderBottom: `1px solid ${c.border}`, color: c.text2 }}>
        <span className="border-b-2 pb-0.5 font-semibold" style={{ color: c.brand, borderColor: c.brand }}>全部商品</span>
        <span>上衣</span>
        <span>褲裝</span>
        <span>配件</span>
      </div>
      <div className="px-3 pb-4 pt-3">
        <p className="mb-2 text-sm font-semibold" style={serif}>{theme.storefront?.enabled ? theme.storefront.productsTitle : '全部商品'}</p>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {items.map((i) => (
            <div key={i} style={cardStyle}>
              <div className={cols === 1 ? 'aspect-[4/3]' : 'aspect-[4/5]'} style={{ background: c.surface, borderRadius: imgRadius }}>
                {images[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={images[i]} alt="" className="h-full w-full object-cover" />
                ) : <div className="h-full w-full opacity-80" style={{ background: `radial-gradient(circle at 50% 55%, ${swatch[i % 4]} 0 34%, transparent 35%)` }} />}
              </div>
              <p className="mt-1.5 truncate text-[10px] font-semibold" style={serif}>城市印花 T-shirt</p>
              <p className="truncate text-[9px]" style={{ color: c.muted }}>純棉 · 寬鬆版型</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold">
                  NT$590 <span className="font-normal line-through" style={{ color: c.muted }}>790</span>
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px]" style={{ background: c.button, color: c.buttonText }}>＋</span>
              </div>
            </div>
          ))}
        </div>
        {!compact ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-full py-2 text-center text-[11px] font-semibold" style={{ background: c.button, color: c.buttonText }}>加入購物車</div>
            <div className="rounded-full py-2 text-center text-[11px]" style={{ border: `1px solid ${c.borderStrong}`, color: c.text, background: c.surface }}>查看全部</div>
            <p className="text-center text-[10px]">
              <span style={{ color: c.sale }}>限時特價</span> · <span style={{ color: c.gold }}>會員優惠</span> · <span style={{ color: c.text2 }}>免運門檻 NT$1,500</span>
            </p>
          </div>
        ) : null}
      </div>
      <div className="px-3 py-2 text-center text-[9px]" style={{ background: c.header, borderTop: `1px solid ${c.border}`, color: c.muted }}>© Urbanite</div>
    </div>
  );
}
