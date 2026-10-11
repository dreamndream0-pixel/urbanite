'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, Upload } from 'lucide-react';
import { BLOCK_TYPES, MAX_BLOCKS, createBlock, moveBlock, safeBlockUrl, type BlockType, type StorefrontBlock } from '@/lib/storefront-blocks';
import type { Product } from '@/lib/types';
import type { DesignCategory } from '@/app/components/StorefrontDesign';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

export default function StorefrontBlockEditor({ blocks, onChange, categories, products, onUploading, designStyle }: {
  blocks: StorefrontBlock[]; onChange: (blocks: StorefrontBlock[]) => void;
  categories: DesignCategory[]; products: Product[]; onUploading: (busy: boolean) => void;
  designStyle?: string;
}) {
  const [type, setType] = useState<BlockType>('imageText');
  const [active, setActive] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
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
  return <fieldset disabled={uploading} className="min-w-0 space-y-4">
    <legend className="mb-3 text-base font-semibold">首頁板塊 <span className="text-xs font-normal text-neutral-500">{blocks.length} / {MAX_BLOCKS}</span></legend>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm">板塊類型 <select value={type} onChange={(e) => setType(e.target.value as BlockType)} className="ml-2 rounded-md border border-neutral-300 bg-white p-2">{BLOCK_TYPES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <button type="button" disabled={blocks.length >= MAX_BLOCKS} onClick={() => { const next = createBlock(type, crypto.randomUUID()); onChange([...blocks, next]); setActive(next.id); }} className="flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-40"><Plus size={16} />新增板塊</button>
    </div>
    <div className="divide-y divide-neutral-200 border-y border-neutral-200">
      {blocks.map((block, index) => <div key={block.id} data-editor-block={block.id} onDragOver={(e) => { if (dragged) { e.preventDefault(); setTarget(block.id); } }} onDrop={(e) => { e.preventDefault(); if (dragged) onChange(moveBlock(blocks, blocks.findIndex((b) => b.id === dragged), index)); setDragged(null); setTarget(null); }} className={`py-3 ${target === block.id ? 'border-t-2 border-t-neutral-800' : ''}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" draggable={!uploading} aria-label={`拖曳板塊 ${index + 1}`} title="拖曳排序" onDragStart={(e) => { e.dataTransfer.setData('text/plain', block.id); e.dataTransfer.effectAllowed = 'move'; setDragged(block.id); }} onDragEnd={() => { setDragged(null); setTarget(null); }} className="flex h-9 w-8 shrink-0 cursor-grab items-center justify-center text-neutral-500"><GripVertical size={18} /></button>
          <button type="button" onClick={() => setActive(active === block.id ? null : block.id)} aria-expanded={active === block.id} className="min-w-0 flex-1 break-words text-left text-sm font-medium">{index + 1}. {block.title || BLOCK_TYPES.find((t) => t.key === block.type)?.label}</button>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={block.visible} onChange={(e) => patch(block.id, { visible: e.target.checked })} aria-label={`顯示板塊 ${index + 1}`} />顯示</label>
          <div className="flex shrink-0">
            <IconButton label={`上移板塊 ${index + 1}`} disabled={index === 0} onClick={() => onChange(moveBlock(blocks, index, index - 1))}><ArrowUp size={16} /></IconButton>
            <IconButton label={`下移板塊 ${index + 1}`} disabled={index === blocks.length - 1} onClick={() => onChange(moveBlock(blocks, index, index + 1))}><ArrowDown size={16} /></IconButton>
            <IconButton label={`複製板塊 ${index + 1}`} disabled={blocks.length >= MAX_BLOCKS} onClick={() => { const next = { ...block, id: crypto.randomUUID() }; onChange([...blocks.slice(0, index + 1), next, ...blocks.slice(index + 1)]); setActive(next.id); }}><Copy size={16} /></IconButton>
            <IconButton label={`刪除板塊 ${index + 1}`} onClick={async () => { if (await uiConfirm('刪除這個板塊？發布前不會影響正式官網。')) onChange(blocks.filter((b) => b.id !== block.id)); }}><Trash2 size={16} /></IconButton>
          </div>
        </div>
        {active === block.id && <div className="grid gap-4 px-2 pb-2 pt-4 sm:grid-cols-2">
          <TextField label="板塊標題" value={block.title} max={120} onChange={(title) => patch(block.id, { title })} />
          <label className="text-sm">內文<textarea value={block.text} maxLength={2000} rows={3} onChange={(e) => patch(block.id, { text: e.target.value })} className="mt-1 block w-full rounded-md border border-neutral-300 p-2" /></label>
          {['hero', 'imageText', 'video'].includes(block.type) && <>
            <TextField label={block.type === 'video' ? '影片封面網址' : '圖片網址'} value={block.image} max={2048} onChange={(image) => patch(block.id, { image })} url />
            <label className="flex items-center gap-2 self-center text-sm"><Upload size={16} />{uploading ? '上傳中...' : '上傳圖片'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void upload(block.id, e.target.files?.[0]); e.target.value = ''; }} className="min-w-0 max-w-full text-xs" /></label>
          </>}
          {block.type === 'video' && <TextField label="影片網址（MP4 / WebM）" value={block.video} max={2048} onChange={(video) => patch(block.id, { video })} url />}
          <TextField label="按鈕文字" value={block.action} max={40} onChange={(action) => patch(block.id, { action })} />
          <TextField label="按鈕連結" value={block.href} max={2048} onChange={(href) => patch(block.id, { href })} url />
          {block.type === 'products' && <>
            <label className="text-sm">商品來源<select value={block.source} onChange={(e) => patch(block.id, { source: e.target.value as StorefrontBlock['source'] })} className="mt-1 block w-full rounded-md border p-2"><option value="all">全部上架商品</option><option value="category">指定分類</option><option value="selected">指定商品</option></select></label>
            {block.source === 'category' && <label className="text-sm">商品分類<select value={block.category} onChange={(e) => patch(block.id, { category: e.target.value })} className="mt-1 block w-full rounded-md border p-2"><option value="">選擇分類</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>}
            {block.source === 'selected' && <fieldset className="max-h-48 overflow-y-auto border-y py-2"><legend className="text-sm">選取商品（最多 24 件）</legend>{products.map((p) => <label key={p.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={block.productIds.includes(p.id)} disabled={!block.productIds.includes(p.id) && block.productIds.length >= 24} onChange={(e) => patch(block.id, { productIds: e.target.checked ? [...block.productIds, p.id] : block.productIds.filter((id) => id !== p.id) })} />{p.name}</label>)}</fieldset>}
            <label className="text-sm">顯示件數<input type="number" min={1} max={24} value={block.limit} onChange={(e) => patch(block.id, { limit: Math.min(24, Math.max(1, Number(e.target.value))) })} className="mt-1 block w-full rounded-md border p-2" /></label>
          </>}
          {block.type === 'categories' && designStyle === 'classic' && <label className="text-sm">分類圖片樣式<select value={block.categoryImageStyle ?? 'inherit'} onChange={(e) => patch(block.id, { categoryImageStyle: e.target.value === 'inherit' ? undefined : e.target.value as StorefrontBlock['categoryImageStyle'] })} className="mt-1 block w-full rounded-md border p-2"><option value="inherit">沿用一般設定</option><option value="circle">圓形</option><option value="square">方形</option><option value="cutout">去背 PNG</option></select></label>}
          {(block.type === 'products' || (block.type === 'categories' && designStyle !== 'classic')) && <label className="text-sm">電腦欄數<select value={block.columns} onChange={(e) => patch(block.id, { columns: Number(e.target.value) })} className="mt-1 block w-full rounded-md border p-2">{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 欄</option>)}</select></label>}
          {block.type !== 'announcement' && !(block.type === 'categories' && designStyle === 'classic') && <label className="text-sm">圖片比例<select value={block.ratio} onChange={(e) => patch(block.id, { ratio: e.target.value as StorefrontBlock['ratio'] })} className="mt-1 block w-full rounded-md border p-2"><option value="wide">橫式 16:9</option><option value="square">正方形 1:1</option><option value="portrait">直式 4:5</option></select></label>}
          <label className="text-sm">上下間距 {block.spacing}px<input type="range" min={0} max={96} step={4} value={block.spacing} onChange={(e) => patch(block.id, { spacing: Number(e.target.value) })} className="mt-2 block w-full" /></label>
          <div className="flex items-center gap-3 text-sm"><label className="flex items-center gap-2">背景色<input type="color" value={block.background || '#ffffff'} onChange={(e) => patch(block.id, { background: e.target.value })} className="h-9 w-10" /></label><label className="flex items-center gap-1"><input type="checkbox" checked={!block.background} onChange={(e) => patch(block.id, { background: e.target.checked ? '' : '#ffffff' })} />沿用全站</label></div>
        </div>}
      </div>)}
    </div>
  </fieldset>;
}
function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-neutral-100 disabled:opacity-25">{children}</button>;
}
function TextField({ label, value, max, onChange, url = false }: { label: string; value: string; max: number; onChange: (value: string) => void; url?: boolean }) {
  const invalid = url && !!value && !safeBlockUrl(value);
  return <label className="text-sm">{label}<input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className="mt-1 block w-full min-w-0 rounded-md border border-neutral-300 p-2" />{invalid && <span className="text-xs text-red-700">請使用 HTTPS、站內路徑或 #錨點連結</span>}</label>;
}
