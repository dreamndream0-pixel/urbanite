'use client';

import { useEffect, useState } from 'react';
import type { Category, Product } from '@/lib/types';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { lockScroll } from '@/lib/scroll-lock';

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

// 促銷活動頁的「分類管理」:和主站分類管理相同的功能(名稱、英文名、圖片、顯示、排序、商品),但只屬於這個活動
export default function CampaignCategoryManager({ campaignId, campaignName, categories, products, onCategoriesChange, onProductChange, onClose }: Props) {
  useEffect(() => lockScroll(), []);
  const mine = categories.filter((c) => c.campaign_id === campaignId).sort((a, b) => order(a) - order(b));
  const [draft, setDraft] = useState({ name: '', en: '' });
  const [uploading, setUploading] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const replace = (c: Category) => onCategoriesChange(categories.map((x) => (x.id === c.id ? c : x)));
  async function patch(c: Category, body: Partial<Pick<Category, 'name' | 'en' | 'sort_order' | 'image'>>) {
    replace({ ...c, ...body });
    const res = await fetch(`/api/categories/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) void uiAlert('分類更新失敗,請再試一次');
  }
  async function add() {
    const name = draft.name.trim();
    if (!name) return void uiAlert('請輸入分類名稱');
    const slug = `cp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, name, en: draft.en.trim() || name.toUpperCase(), campaign_id: campaignId, sort_order: mine.length + 1 }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '新增分類失敗');
    onCategoriesChange([...categories, data as Category]);
    setDraft({ name: '', en: '' });
  }
  async function move(c: Category, dir: -1 | 1) {
    const i = mine.findIndex((x) => x.id === c.id);
    if (!mine[i + dir]) return;
    // 交換後重新編號(1, 2, 3…),隱藏的分類維持負號
    const list = [...mine];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    const renumbered = list.map((x, idx) => ({ ...x, sort_order: (idx + 1) * (x.sort_order < 0 ? -1 : 1) }));
    const changed = renumbered.filter((x) => x.sort_order !== mine.find((m) => m.id === x.id)?.sort_order);
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
    if (!(await uiConfirm(`刪除分類「${c.name}」?\n${inCat.length} 個商品會變成未分類,商品本身不會刪除。`, { danger: true }))) return;
    await Promise.all(inCat.map((p) => setProductCategory(p, '')));
    const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' });
    if (!res.ok) return void uiAlert('刪除失敗');
    onCategoriesChange(categories.filter((x) => x.id !== c.id));
  }

  const open = mine.find((c) => c.id === openId) ?? null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[#f6f2ec] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e5ded4] bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-lg font-bold">{open ? `分類商品:${open.name}` : '活動分類管理'}</p>
            <p className="truncate text-xs text-[#8a7f72]">{campaignName}・只用在這個活動頁,和主站分類分開</p>
          </div>
          <button type="button" onClick={open ? () => setOpenId(null) : onClose} className="shrink-0 rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">{open ? '返回' : '完成'}</button>
        </div>

        {open ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋活動商品" className="h-10 w-full rounded-lg border border-[#e5ded4] bg-white px-3 text-sm" />
            <p className="text-xs text-[#8a7f72]">勾選 = 放進「{open.name}」;取消勾選 = 改成未分類。</p>
            <div className="divide-y divide-[#eee7de] overflow-hidden rounded-xl border border-[#e5ded4] bg-white">
              {products.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).map((p) => {
                const inThis = p.category === open.slug;
                const other = mine.find((c) => c.slug === p.category && c.id !== open.id);
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                    <input type="checkbox" checked={inThis} onChange={(e) => void setProductCategory(p, e.target.checked ? open.slug : '')} className="h-5 w-5 shrink-0 accent-[#702838]" />
                    <span className="h-12 w-10 shrink-0 overflow-hidden rounded bg-[#f5f1eb]">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span>{other ? <span className="text-[11px] text-[#a99e8f]">目前在「{other.name}」</span> : null}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="rounded-xl border border-[#e5ded4] bg-white p-3">
              <p className="text-sm font-semibold">新增分類</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="顯示名稱,例如:上衣" className="h-10 rounded-lg border border-[#e5ded4] px-3 text-sm" />
                <input value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} placeholder="英文名稱(選填)" className="h-10 rounded-lg border border-[#e5ded4] px-3 text-sm" />
                <button type="button" onClick={() => void add()} className="h-10 rounded-lg bg-[#702838] px-4 text-sm font-semibold text-white">新增分類</button>
              </div>
            </div>
            <p className="text-xs text-[#8a7f72]">點圖片框上傳分類圖片(活動頁分類導覽顯示,樣式同系統設定);關閉「顯示」的分類不會出現在活動頁。</p>
            {mine.length === 0 ? <p className="rounded-xl bg-white p-6 text-center text-sm text-[#a99e8f]">還沒有分類</p> : mine.map((c, i) => {
              const count = products.filter((p) => p.category === c.slug).length;
              const visible = c.sort_order >= 0;
              return (
                <div key={c.id} className="rounded-xl border border-[#e5ded4] bg-white p-3">
                  <div className="flex items-start gap-3">
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
                      <button type="button" disabled={i === 0} onClick={() => void move(c, -1)} className="rounded border border-[#d7c9bd] px-2.5 py-1 disabled:opacity-30">上</button>
                      <button type="button" disabled={i === mine.length - 1} onClick={() => void move(c, 1)} className="rounded border border-[#d7c9bd] px-2.5 py-1 disabled:opacity-30">下</button>
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
