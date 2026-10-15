'use client';

import { useEffect, useState } from 'react';
import type { Category, Product } from '@/lib/types';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { lockScroll } from '@/lib/scroll-lock';
import { useLongPressReorder } from './useLongPressReorder';

type Props = {
  campaignId: string;
  campaignName: string;
  categories: Category[]; // 所有活動的專屬分類
  products: Product[]; // 這個活動的商品
  onCategoriesChange: (list: Category[]) => void;
  onProductChange: (product: Product) => void;
  onClose: () => void;
};

const order = (c: Category) => Math.abs(c.sort_order || 0);
const byOrder = (a: { sort_order?: number }, b: { sort_order?: number }) => Math.abs(a.sort_order ?? 0) - Math.abs(b.sort_order ?? 0);

// 活動分類代碼:時間 + 亂數,不會和其他分類重複(在元件外產生,避免被當成畫面計算的一部分)
const newCategorySlug = () => `cp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// 上層分類在前、子分類縮排接在後面(和主站分類管理相同)
function tree(cats: Category[]) {
  const result: { cat: Category; depth: number }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const c of cats.filter((x) => (x.parent_id || '') === parent).sort(byOrder)) {
      result.push({ cat: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk('', 0);
  // 上層分類已被刪除的孤兒分類也列出來
  for (const c of cats) if (!result.some((r) => r.cat.id === c.id)) result.push({ cat: c, depth: 0 });
  return result;
}

// 促銷活動頁的「分類管理」:和主站分類管理相同的邏輯(子分類、圖片、顯示、排序、分類內商品的加入 / 移出 / 拖曳排序),
// 但只屬於這個活動
export default function CampaignCategoryManager({ campaignId, campaignName, categories, products, onCategoriesChange, onProductChange, onClose }: Props) {
  useEffect(() => lockScroll(), []);
  const mine = categories.filter((c) => c.campaign_id === campaignId);
  const rows = tree(mine);
  const [draft, setDraft] = useState({ name: '', en: '', parent_id: '' });
  const [uploading, setUploading] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const replace = (c: Category) => onCategoriesChange(categories.map((x) => (x.id === c.id ? c : x)));
  async function patch(c: Category, body: Partial<Pick<Category, 'name' | 'en' | 'sort_order' | 'image' | 'parent_id'>>) {
    replace({ ...c, ...body });
    const res = await fetch(`/api/categories/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) void uiAlert('分類更新失敗,請再試一次');
  }
  async function add() {
    const name = draft.name.trim();
    if (!name) return void uiAlert('請輸入分類名稱');
    const slug = newCategorySlug();
    const siblings = mine.filter((c) => (c.parent_id || '') === draft.parent_id);
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, name, en: draft.en.trim() || name.toUpperCase(), campaign_id: campaignId, parent_id: draft.parent_id || null, sort_order: siblings.length + 1 }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '新增分類失敗');
    onCategoriesChange([...categories, data as Category]);
    setDraft({ name: '', en: '', parent_id: draft.parent_id });
  }
  // 同一層之間上下移動
  async function move(c: Category, dir: -1 | 1) {
    const siblings = mine.filter((x) => (x.parent_id || '') === (c.parent_id || '')).sort(byOrder);
    const i = siblings.findIndex((x) => x.id === c.id);
    if (!siblings[i + dir]) return;
    const list = [...siblings];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    const renumbered = list.map((x, idx) => ({ ...x, sort_order: (idx + 1) * (x.sort_order < 0 ? -1 : 1) }));
    const changed = renumbered.filter((x) => x.sort_order !== siblings.find((m) => m.id === x.id)?.sort_order);
    onCategoriesChange(categories.map((x) => renumbered.find((r) => r.id === x.id) ?? x));
    await Promise.all(changed.map((x) =>
      fetch(`/api/categories/${x.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: x.sort_order }) })));
  }
  async function upload(c: Category, file?: File) {
    if (!file) return;
    setUploading(c.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'categories');
      fd.append('productId', c.slug);
      const res = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '圖片上傳失敗');
      await patch(c, { image: data.image_url });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '圖片上傳失敗');
    } finally { setUploading(''); }
  }
  async function setProductCategory(p: Product, slug: string) {
    const res = await fetch(`/api/products/${encodeURIComponent(p.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: slug }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '更新商品分類失敗');
    onProductChange(data as Product);
  }
  async function remove(c: Category) {
    const inCat = products.filter((p) => p.category === c.slug);
    const children = mine.filter((x) => x.parent_id === c.id);
    if (!(await uiConfirm(`刪除分類「${c.name}」?\n${inCat.length} 個商品會變成未分類,商品本身不會刪除。${children.length ? `\n${children.length} 個子分類會改成主分類。` : ''}`, { danger: true }))) return;
    await Promise.all(inCat.map((p) => setProductCategory(p, '')));
    await Promise.all(children.map((x) => patch(x, { parent_id: null })));
    const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' });
    if (!res.ok) return void uiAlert('刪除失敗');
    onCategoriesChange(categories.filter((x) => x.id !== c.id).map((x) => (x.parent_id === c.id ? { ...x, parent_id: null } : x)));
  }

  const open = mine.find((c) => c.id === openId) ?? null;
  // 分類內商品:依活動商品順序(sort_order)排列,可拖曳調整
  const inOpen = open ? products.filter((p) => p.category === open.slug).sort(byOrder) : [];
  const { listRef, order: sortIds, sorting, start } = useLongPressReorder(inOpen.map((p) => p.id), (ids) => {
    // 把這個分類的商品放回它們在活動商品整體順序中的位置,再重新編號(只更新有變動的)
    const all = [...products].sort(byOrder);
    const moved = new Set(ids);
    const queue = [...ids];
    const nextIds = all.map((p) => (moved.has(p.id) ? queue.shift()! : p.id));
    const updates = nextIds.map((id, i) => ({ product: products.find((p) => p.id === id)!, sort_order: i })).filter((u) => u.product.sort_order !== u.sort_order);
    if (!updates.length) return;
    for (const u of updates) onProductChange({ ...u.product, sort_order: u.sort_order });
    void (async () => {
      for (let i = 0; i < updates.length; i += 8) {
        const results = await Promise.all(updates.slice(i, i + 8).map((u) => fetch(`/api/products/${encodeURIComponent(u.product.id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: u.sort_order }),
        }).then((r) => r.ok).catch(() => false)));
        if (results.includes(false)) return void uiAlert('排序儲存失敗,請重新整理後再試');
      }
      uiToast('已更新商品排序');
    })();
  });
  const sortedInOpen = sortIds.map((id) => inOpen.find((p) => p.id === id)!).filter(Boolean);
  const candidates = open ? products.filter((p) => p.category !== open.slug && (!q.trim() || [p.name, p.id].join(' ').toLowerCase().includes(q.trim().toLowerCase()))) : [];
  const catName = (slug: string) => mine.find((c) => c.slug === slug)?.name;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[#f6f2ec] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e5ded4] bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{open ? `分類詳情:${open.name}` : '活動分類管理'}</p>
            <p className="truncate text-xs text-[#8a7f72]">{open ? `目前 ${inOpen.length} 個商品` : `${campaignName}・只用在這個活動頁,和主站分類分開`}</p>
          </div>
          <button type="button" onClick={open ? () => setOpenId(null) : onClose} className="shrink-0 rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">{open ? '返回' : '完成'}</button>
        </div>

        {open ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section>
              <h4 className="font-semibold">此分類商品</h4>
              <p className="mb-2 mt-1 text-xs text-[#8a7f72]">長按商品(或按住左側 ⋮⋮)上下拖曳,活動頁依這個順序顯示。</p>
              {sortedInOpen.length === 0 ? <p className="rounded-xl bg-white p-6 text-center text-sm text-[#a99e8f]">此分類目前沒有商品</p> : (
                <div ref={listRef} className="space-y-2">
                  {sortedInOpen.map((p) => (
                    <div
                      key={p.id}
                      data-sort-row
                      onPointerDown={(e) => start(e, p.id)}
                      onContextMenu={(e) => e.preventDefault()}
                      className={`flex select-none items-center gap-3 rounded-xl border bg-white p-2.5 [-webkit-touch-callout:none] ${sorting === p.id ? 'border-[#1f1b19] bg-[#faf3ea] shadow-md' : 'border-[#e5ded4]'}`}
                    >
                      <span onPointerDown={(e) => { e.stopPropagation(); start(e, p.id, true); }} className="cursor-grab touch-none px-1 text-[#b3a897]" aria-hidden="true">⋮⋮</span>
                      <span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-[#f5f1eb]">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-xs text-[#8a7f72]">{p.id} / {p.status}</span></span>
                      <button type="button" onClick={() => void setProductCategory(p, '')} className="shrink-0 rounded-full border border-[#e0b4b4] px-3 py-1.5 text-xs font-semibold text-[#c0392b]">移出</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="shrink-0 font-semibold">加入商品</h4>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋活動商品" className="h-9 min-w-0 flex-1 rounded-lg border border-[#e5ded4] bg-white px-3 text-sm sm:max-w-56" />
              </div>
              {candidates.length === 0 ? <p className="rounded-xl bg-white p-6 text-center text-sm text-[#a99e8f]">沒有可加入的商品</p> : (
                <div className="space-y-2">
                  {candidates.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#e5ded4] bg-white p-2.5">
                      <span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-[#f5f1eb]">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-xs text-[#8a7f72]">{p.id} / {catName(p.category) ?? '未分類'}</span></span>
                      <button type="button" onClick={() => void setProductCategory(p, open.slug)} className="shrink-0 rounded-full bg-[#1f1b19] px-3 py-1.5 text-xs font-semibold text-white">加入</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="rounded-xl border border-[#e5ded4] bg-white p-3">
              <p className="text-sm font-semibold">新增分類</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="顯示名稱,例如:上衣" className="h-10 rounded-lg border border-[#e5ded4] px-3 text-sm" />
                <input value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} placeholder="英文名稱(選填)" className="h-10 rounded-lg border border-[#e5ded4] px-3 text-sm" />
                <select value={draft.parent_id} onChange={(e) => setDraft({ ...draft, parent_id: e.target.value })} className="h-10 rounded-lg border border-[#e5ded4] bg-white px-3 text-sm">
                  <option value="">上層分類(留空=主分類)</option>
                  {rows.map(({ cat, depth }) => <option key={cat.id} value={cat.id}>{depth ? '— '.repeat(depth) : ''}{cat.name}</option>)}
                </select>
                <button type="button" onClick={() => void add()} className="h-10 rounded-lg bg-[#702838] px-4 text-sm font-semibold text-white">新增分類</button>
              </div>
            </div>
            <p className="text-xs text-[#8a7f72]">點圖片框上傳分類圖片(活動頁分類導覽顯示,樣式同系統設定);關閉「顯示」的分類不會出現在活動頁。子分類會出現在上層分類的下拉選單裡。</p>
            {rows.length === 0 ? <p className="rounded-xl bg-white p-6 text-center text-sm text-[#a99e8f]">還沒有分類</p> : rows.map(({ cat: c, depth }) => {
              const count = products.filter((p) => p.category === c.slug).length;
              const visible = c.sort_order >= 0;
              const siblings = mine.filter((x) => (x.parent_id || '') === (c.parent_id || '')).sort(byOrder);
              const i = siblings.findIndex((x) => x.id === c.id);
              return (
                <div key={c.id} className="rounded-xl border border-[#e5ded4] bg-white p-3" style={{ marginLeft: Math.min(depth, 3) * 20 }}>
                  <div className="flex items-start gap-3">
                    {depth > 0 && <span className="pt-4 text-[#c9bdb0]">└</span>}
                    <label className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[#f1f1f1] ring-1 ring-[#e5ded4]">
                      {c.image ? <img src={c.image} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] font-semibold text-[#6b6156]">{uploading === c.id ? '上傳中' : '＋圖片'}</span>}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading === c.id} onChange={(e) => { void upload(c, e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <input value={c.name} onChange={(e) => replace({ ...c, name: e.target.value })} onBlur={() => void patch(c, { name: c.name.trim() || '未命名' })} className="h-9 w-full rounded-lg border border-[#e5ded4] px-2 text-sm font-semibold" aria-label="分類名稱" />
                      <input value={c.en} onChange={(e) => replace({ ...c, en: e.target.value })} onBlur={() => void patch(c, { en: c.en.trim() })} placeholder="英文名稱" className="h-8 w-full rounded-lg border border-[#e5ded4] px-2 text-xs" aria-label="英文名稱" />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <button type="button" onClick={() => { setOpenId(c.id); setQ(''); }} className="rounded-full border border-[#d8d0c6] px-3 py-1.5 font-semibold">商品 {count} ›</button>
                    <button type="button" onClick={() => void patch(c, { sort_order: (order(c) || i + 1) * (visible ? -1 : 1) })} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ${visible ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#efe9e0] text-[#8a7f72]'}`}>{visible ? '顯示中' : '已隱藏'}</button>
                    <span className="ml-auto flex gap-1">
                      <button type="button" disabled={i <= 0} onClick={() => void move(c, -1)} className="rounded border border-[#d7c9bd] px-2.5 py-1 disabled:opacity-30">上</button>
                      <button type="button" disabled={i === siblings.length - 1} onClick={() => void move(c, 1)} className="rounded border border-[#d7c9bd] px-2.5 py-1 disabled:opacity-30">下</button>
                      <button type="button" onClick={() => void remove(c)} className="px-2 py-1 font-semibold text-[#c0392b]">刪除</button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
