'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, EyeOff, GripVertical, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { BLOCK_TYPES, COPY_POSITIONS, MAX_BLOCKS, createBlock, moveBlock, safeBlockUrl, type BlockType, type CopyPosition, type StorefrontBlock } from '@/lib/storefront-blocks';
import type { Banner, Product } from '@/lib/types';
import type { DesignCategory } from '@/app/components/StorefrontDesign';
import NumberInput from './NumberInput';
import FixedBannerCropModal from './FixedBannerCropModal';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

const input = 'mt-1 block w-full min-w-0 rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm';
const typeLabel = (type: BlockType) => BLOCK_TYPES.find((t) => t.key === type)?.label ?? type;

// 後台 模板設定 → 首頁內容:一個板塊一列,點開只顯示該類型需要的欄位,進階設定收起來
export default function StorefrontBlockEditor({ blocks, onChange, categories, products, banners = [], onUploading }: {
  blocks: StorefrontBlock[]; onChange: (blocks: StorefrontBlock[]) => void;
  categories: DesignCategory[]; products: Product[]; banners?: Banner[]; onUploading: (busy: boolean) => void;
  designStyle?: string;
}) {
  const [type, setType] = useState<BlockType>('imageText');
  const [active, setActive] = useState<string | null>(null);
  const { listRef, sorting, start: startSort, swallowClick } = useLongPressSort(blocks, onChange);
  const [uploading, setUploading] = useState(false);
  const patch = (id: string, value: Partial<StorefrontBlock>) => onChange(blocks.map((block) => block.id === id ? { ...block, ...value } : block));
  async function upload(id: string, file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { void uiAlert('圖片請小於 5MB'); return; }
    setUploading(true); onUploading(true);
    try {
      const form = new FormData(); form.set('file', file); form.set('folder', 'storefront'); form.set('productId', id);
      const response = await fetch('/api/products/image', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok || !safeBlockUrl(data.image_url)) throw new Error(data.error || '圖片上傳失敗');
      patch(id, { image: data.image_url });
    } catch (error) { void uiAlert(error instanceof Error ? error.message : '圖片上傳失敗'); }
    finally { setUploading(false); onUploading(false); }
  }
  return <fieldset disabled={uploading} className="min-w-0 space-y-3">
    <legend className="sr-only">首頁板塊</legend>
    <ol ref={listRef} className="space-y-2">
      {blocks.map((block, index) => {
        const open = active === block.id;
        const dragging = sorting === block.id;
        return <li key={block.id} data-editor-block={block.id} onClickCapture={swallowClick}
          className={`select-none rounded-xl border bg-white transition-shadow [-webkit-touch-callout:none] ${open ? 'border-[#1f1b19]/40 shadow-sm' : 'border-[#e5ded4]'} ${dragging ? 'relative z-10 scale-[1.02] shadow-lg ring-2 ring-[#1f1b19]/30' : ''} ${block.visible ? '' : 'opacity-60'}`}>
          <div className="flex items-center gap-1 px-1.5 py-1.5" onPointerDown={(e) => startSort(e, block.id, false)}>
            <span aria-hidden="true" title="按住拖曳排序" onPointerDown={(e) => { e.stopPropagation(); startSort(e, block.id, true); }} className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-[#b8ad9f]"><GripVertical size={18} /></span>
            <button type="button" onClick={() => setActive(open ? null : block.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
              <span className="shrink-0 rounded-full bg-[#efe8dd] px-2 py-0.5 text-[11px] text-[#6b6156]">{typeLabel(block.type)}</span>
              <span className="min-w-0 truncate text-sm font-medium">{block.type === 'carousel' ? `輪播圖${block.group}` : block.title.split('\n').join(' ') || <span className="text-[#a99e8f]">(未命名)</span>}</span>
              <ChevronDown size={16} className={`ml-auto shrink-0 text-[#a99e8f] transition ${open ? 'rotate-180' : ''}`} />
            </button>
            <IconButton label={block.visible ? `隱藏板塊 ${index + 1}` : `顯示板塊 ${index + 1}`} onClick={() => patch(block.id, { visible: !block.visible })}>{block.visible ? <Eye size={16} /> : <EyeOff size={16} />}</IconButton>
            <IconButton label={`上移板塊 ${index + 1}`} disabled={index === 0} onClick={() => onChange(moveBlock(blocks, index, index - 1))}><ArrowUp size={16} /></IconButton>
            <IconButton label={`下移板塊 ${index + 1}`} disabled={index === blocks.length - 1} onClick={() => onChange(moveBlock(blocks, index, index + 1))}><ArrowDown size={16} /></IconButton>
          </div>
          {open && <div className="space-y-3 border-t border-[#efe8dd] px-3 pb-3 pt-3">
            <BlockFields block={block} patch={(value) => patch(block.id, value)} categories={categories} products={products} banners={banners} uploading={uploading} onUpload={(file) => void upload(block.id, file)} />
            <div className="rounded-lg bg-[#faf8f5] px-3 py-2.5 text-sm">
              <p className="text-xs text-[#8a7f72]">版面設定</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {block.type === 'products' && <label className="text-sm">{'商品圖片比例'}<select value={block.ratio} onChange={(e) => patch(block.id, { ratio: e.target.value as StorefrontBlock['ratio'] })} className={input}><option value="portrait">直式 4:5</option><option value="square">正方形 1:1</option><option value="wide">橫式 16:9</option></select></label>}
                {block.type === 'products' && <label className="text-sm">電腦版欄數<select value={block.columns} onChange={(e) => patch(block.id, { columns: Number(e.target.value) })} className={input}>{[2, 3, 4].map((count) => <option key={count} value={count}>{count} 欄</option>)}</select></label>}
                <label className="text-sm">上下間距 {block.spacing}px<input type="range" min={0} max={96} step={4} value={block.spacing} onChange={(e) => patch(block.id, { spacing: Number(e.target.value) })} className="mt-2 block w-full" /></label>
                <div className="flex items-center gap-3 text-sm"><label className="flex items-center gap-2">背景色<input type="color" value={block.background || '#ffffff'} onChange={(e) => patch(block.id, { background: e.target.value })} className="h-9 w-10" /></label><label className="flex items-center gap-1"><input type="checkbox" checked={!block.background} onChange={(e) => patch(block.id, { background: e.target.checked ? '' : '#ffffff' })} />沿用全站</label></div>
              </div>
            </div>
            <div className="flex justify-end gap-1">
              <button type="button" disabled={blocks.length >= MAX_BLOCKS} onClick={() => { const next = { ...block, id: crypto.randomUUID() }; onChange([...blocks.slice(0, index + 1), next, ...blocks.slice(index + 1)]); setActive(next.id); }} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[#6b6156] hover:bg-[#f6f2ec] disabled:opacity-30"><Copy size={14} />複製</button>
              <button type="button" onClick={async () => { if (await uiConfirm('刪除這個板塊?發布前不會影響正式官網。')) onChange(blocks.filter((b) => b.id !== block.id)); }} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[#b42318] hover:bg-[#fdecea]"><Trash2 size={14} />刪除</button>
            </div>
          </div>}
        </li>;
      })}
    </ol>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="新增板塊類型" value={type} onChange={(e) => setType(e.target.value as BlockType)} className="rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm">{BLOCK_TYPES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
      <button type="button" disabled={blocks.length >= MAX_BLOCKS} onClick={() => { const next = createBlock(type, crypto.randomUUID()); if (type === 'products' || type === 'imageText') next.href = '#store-products'; if (type === 'carousel') next.title = ''; onChange([...blocks, next]); setActive(next.id); }} className="flex items-center gap-1.5 rounded-lg bg-[#1f1b19] px-3 py-2 text-sm text-white disabled:opacity-40"><Plus size={16} />新增板塊</button>
      <span className="text-xs text-[#a99e8f]">{blocks.length} / {MAX_BLOCKS}</span>
    </div>
  </fieldset>;
}

function BlockFields({ block, patch, categories, products, banners, uploading, onUpload }: {
  block: StorefrontBlock; patch: (value: Partial<StorefrontBlock>) => void; categories: DesignCategory[]; products: Product[]; banners: Banner[];
  uploading: boolean; onUpload: (file?: File) => void;
}) {
  const title = (label: string, rows = 1) => rows > 1
    ? <label className="block text-sm">{label}<textarea value={block.title} maxLength={120} rows={rows} onChange={(e) => patch({ title: e.target.value })} className={input} /></label>
    : <TextField label={label} value={block.title} max={120} onChange={(v) => patch({ title: v })} />;
  const text = (label: string, rows = 2) => <label className="block text-sm">{label}<textarea value={block.text} maxLength={2000} rows={rows} onChange={(e) => patch({ text: e.target.value })} className={input} /></label>;
  // 上傳前先依板塊比例裁切(順便把手機大照片壓小)
  const output: [number, number] = block.type === 'imageText' ? [1600, 800] : block.ratio === 'portrait' ? [1080, 1350] : block.ratio === 'square' ? [1200, 1200] : [1600, 900];
  const ratioName = block.type === 'imageText' ? '橫式 2:1' : block.ratio === 'portrait' ? '直式 4:5' : block.ratio === 'square' ? '正方形 1:1' : '橫式 16:9';
  const spec = `上傳規格:${output[0]} × ${output[1]} px(${ratioName}),JPG / PNG / WEBP。選好照片後可拖曳裁切,大照片會自動壓縮。`;
  const image = (label: string, hint?: string) => <ImageField label={label} spec={spec} hint={hint} value={block.image} output={output} uploading={uploading} onUpload={onUpload} onChange={(v) => patch({ image: v })} />;
  // 先選圖片尺寸,再上傳圖片
  const sizeSelect = <label className="block text-sm">圖片尺寸<select value={block.ratio} onChange={(e) => patch({ ratio: e.target.value as StorefrontBlock['ratio'] })} className={input}><option value="portrait">直式 4:5(1080 × 1350 px)</option><option value="square">正方形 1:1(1200 × 1200 px)</option><option value="wide">橫式 16:9(1600 × 900 px)</option></select></label>;
  const link = <TextField label="點擊後前往" placeholder="留空 = 顯示全部商品" value={block.href === '#store-products' ? '' : block.href} max={2048} onChange={(v) => patch({ href: v || '#store-products' })} url />;
  switch (block.type) {
    case 'hero': return <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-3">{title('大標題(可換行)', 2)}<TextField label="副標題" value={block.text} max={160} onChange={(v) => patch({ text: v })} /><TextField label="按鈕文字" placeholder="留空就不顯示按鈕" value={block.action} max={40} onChange={(v) => patch({ action: v })} />{link}</div>
      <div className="space-y-3">{sizeSelect}{image('主視覺圖片', '建議用沒有文字的照片,標題會疊在照片上。')}</div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <label className="text-sm">文字與按鈕位置<select value={block.copyPos} onChange={(e) => patch({ copyPos: e.target.value as CopyPosition })} className={input}>{COPY_POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
        <label className="text-sm">按鈕不透明度(%)<NumberInput min={0} max={100} value={block.buttonOpacity} onChange={(e) => patch({ buttonOpacity: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} className={input} /><span className="mt-1 block text-[11px] text-[#a99e8f]">0 = 透明、100 = 白色實底(有照片時)</span></label>
      </div>
    </div>;
    case 'products': return <div className="grid gap-3 sm:grid-cols-2">
      {title('區塊標題')}
      <label className="text-sm">顯示件數<NumberInput min={1} max={24} value={block.limit} onChange={(e) => patch({ limit: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })} className={input} /></label>
      <label className="text-sm">商品來源<select value={block.source} onChange={(e) => patch({ source: e.target.value as StorefrontBlock['source'] })} className={input}><option value="all">全部上架商品</option><option value="category">指定分類</option><option value="selected">自己挑選商品</option></select></label>
      {block.source === 'category' && <label className="text-sm">商品分類<select value={block.category} onChange={(e) => patch({ category: e.target.value })} className={input}><option value="">選擇分類</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>}
      {block.source === 'selected' && <fieldset className="max-h-56 overflow-y-auto rounded-lg border border-[#e5ded4] px-3 py-2 sm:col-span-2"><legend className="px-1 text-xs text-[#8a7f72]">勾選商品(最多 24 件,依勾選順序顯示)</legend>{products.map((p) => <label key={p.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={block.productIds.includes(p.id)} disabled={!block.productIds.includes(p.id) && block.productIds.length >= 24} onChange={(e) => patch({ productIds: e.target.checked ? [...block.productIds, p.id] : block.productIds.filter((id) => id !== p.id) })} />{p.name}</label>)}</fieldset>}
    </div>;
    case 'categories': return <div className="space-y-2">{title('區塊標題(選填)')}<p className="text-xs text-[#a99e8f]">會自動列出所有主分類。樣式在上方「分類樣式」切換,分類圖片在「商品及分類 → 分類管理」上傳。</p></div>;
    case 'imageText': return <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-3">{title('大字(例:Daily Wear)')}<TextField label="小字(例:日常系列)" value={block.text} max={200} onChange={(v) => patch({ text: v })} />{link}</div>
      {image('橫幅圖片', '建議用沒有文字的照片。')}
    </div>;
    case 'countdown': return <div className="grid gap-3 sm:grid-cols-2">
      {title('標題')}
      <label className="text-sm">結束時間<input type="datetime-local" value={block.endsAt} onChange={(e) => patch({ endsAt: e.target.value })} className={input} /></label>
      <div className="sm:col-span-2">{text('補充說明(選填)')}</div>
    </div>;
    case 'announcement': return <div className="grid gap-3 sm:grid-cols-2">
      {title('標題')}<TextField label="按鈕文字(選填)" value={block.action} max={40} onChange={(v) => patch({ action: v })} />
      <div className="sm:col-span-2">{text('內容', 3)}</div>{block.action && link}
    </div>;
    case 'carousel': {
      const groups = [...new Set([1, ...banners.map((b) => b.group_no ?? 1), block.group])].sort((a, b) => a - b);
      return <div className="space-y-2">
        <label className="block text-sm">顯示哪一組輪播圖<select value={block.group} onChange={(e) => patch({ group: Number(e.target.value) })} className={input}>{groups.map((g) => <option key={g} value={g}>輪播圖{g}({banners.filter((b) => (b.group_no ?? 1) === g && b.active).length} 張)</option>)}</select></label>
        <label className="block text-sm">輪播顯示比例<select value={block.carouselRatio} onChange={(e) => patch({ carouselRatio: e.target.value as StorefrontBlock['carouselRatio'] })} className={input}><option value="auto">自動適配（手機直式／電腦橫式）</option><option value="portrait">直式 4:5</option><option value="square">正方形 1:1</option><option value="wide">橫式 16:9</option></select></label>
        <p className="text-xs text-[#a99e8f]">輪播圖的圖片在「系統設定 → 輪播圖」上傳和排序。</p>
      </div>;
    }
    case 'video': return <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-3">{title('標題')}<TextField label="影片網址(MP4 / WebM)" value={block.video} max={2048} onChange={(v) => patch({ video: v })} url />{text('說明(選填)')}</div>
      <div className="space-y-3">{sizeSelect}{image('影片封面')}</div>
    </div>;
  }
}

function ImageField({ label, spec, hint, value, output, uploading, onUpload, onChange }: { label: string; spec: string; hint?: string; value: string; output: [number, number]; uploading: boolean; onUpload: (file?: File) => void; onChange: (value: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<File | null>(null);
  return <div className="text-sm">
    <p>{label}</p>
    <div className="mt-1 flex items-start gap-3">
      <button type="button" onClick={() => file.current?.click()} className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-[#d7c9bd] bg-[#faf8f5] text-[#a99e8f] hover:border-[#1f1b19]/40" aria-label={`上傳${label}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={22} />}
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => file.current?.click()} className="rounded-md border border-[#d7c9bd] px-3 py-1.5 text-xs">{uploading ? '上傳中...' : value ? '更換圖片' : '上傳圖片'}</button>
          {value && <button type="button" onClick={() => onChange('')} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[#8a7f72] hover:bg-[#f6f2ec]"><X size={13} />移除</button>}
        </div>
        <p className="text-[11px] leading-4 text-[#6b6156]">{spec}</p>
        {hint && <p className="text-[11px] leading-4 text-[#a99e8f]">{hint}</p>}
      </div>
      <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCrop(f); }} />
      {crop && <FixedBannerCropModal file={crop} busy={uploading} title={`${label} — 裁切取景`} outputW={output[0]} outputH={output[1]} hint={`取景框 ${output[0]} × ${output[1]} px。拖曳照片移動位置,雙指或滑桿縮放。`} onCancel={() => setCrop(null)} onConfirm={(blob, name) => { setCrop(null); onUpload(new File([blob], name, { type: 'image/jpeg' })); }} />}
    </div>
  </div>;
}
function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-[#6b6156] hover:bg-[#f6f2ec] disabled:opacity-25">{children}</button>;
}
function TextField({ label, value, max, onChange, url = false, placeholder }: { label: string; value: string; max: number; onChange: (value: string) => void; url?: boolean; placeholder?: string }) {
  const invalid = url && !!value && !safeBlockUrl(value);
  return <label className="block text-sm">{label}<input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className={input} />{invalid && <span className="text-xs text-red-700">請用 https:// 開頭、站內路徑(/...)或 #錨點</span>}</label>;
}

// 長按(或按住左邊握把)後上下拖曳排序;手機、電腦都能用。拖曳中鎖住頁面捲動,放開後不會誤觸展開
function useLongPressSort(blocks: StorefrontBlock[], onChange: (blocks: StorefrontBlock[]) => void) {
  const listRef = useRef<HTMLOListElement>(null);
  const [sorting, setSorting] = useState<string | null>(null);
  const state = useRef<{ id: string; x: number; y: number; timer: number; active: boolean } | null>(null);
  const latest = useRef({ blocks, onChange });
  const swallow = useRef(false);
  useEffect(() => { latest.current = { blocks, onChange }; });

  useEffect(() => {
    // iOS 要在 touchmove 擋掉預設才不會捲動頁面(必須是 passive: false)
    const blockScroll = (e: TouchEvent) => { if (state.current?.active) e.preventDefault(); };
    const move = (e: PointerEvent) => {
      const s = state.current;
      if (!s) return;
      if (!s.active) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) { clearTimeout(s.timer); state.current = null; }
        return;
      }
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-editor-block]') ?? [])];
      const { blocks: list, onChange: change } = latest.current;
      const from = list.findIndex((b) => b.id === s.id);
      let to = rows.findIndex((row) => { const r = row.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      if (to < 0) to = rows.length - 1;
      if (to > from) to -= 1; // 自己那列還在,往下拖要扣掉
      if (from >= 0 && to !== from) change(moveBlock(list, from, to));
    };
    const end = () => {
      const s = state.current;
      if (!s) return;
      clearTimeout(s.timer);
      if (s.active) { swallow.current = true; setTimeout(() => { swallow.current = false; }, 50); }
      state.current = null;
      setSorting(null);
    };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // pointerup 漏接時(拖曳中列表重排、iOS 手勢中斷、切到背景)也要結束,否則整頁一直被擋住無法捲動
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    window.addEventListener('blur', end);
    document.addEventListener('visibilitychange', end);
    return () => {
      document.removeEventListener('touchmove', blockScroll);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      window.removeEventListener('blur', end);
      document.removeEventListener('visibilitychange', end);
    };
  }, []);

  function start(e: ReactPointerEvent, id: string, immediate: boolean) {
    if (e.button !== 0) return;
    if (!immediate && (e.target as HTMLElement).closest('input,select,textarea')) return;
    const activate = () => {
      if (!state.current) return;
      state.current.active = true;
      setSorting(id);
      navigator.vibrate?.(12);
    };
    state.current = { id, x: e.clientX, y: e.clientY, timer: immediate ? 0 : window.setTimeout(activate, 400), active: false };
    if (immediate) activate();
  }
  // 拖完放開時,不要觸發展開或按鈕
  const swallowClick = (e: React.MouseEvent) => { if (swallow.current) { e.preventDefault(); e.stopPropagation(); } };
  return { listRef, sorting, start, swallowClick };
}
