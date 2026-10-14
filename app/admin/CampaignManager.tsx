'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { lockScroll } from '@/lib/scroll-lock';
import type { Campaign, Category, Product } from '@/lib/types';
import { useLongPressReorder } from './useLongPressReorder';
import CampaignCategoryManager from './CampaignCategoryManager';
import { uiConfirm } from '@/lib/ui-dialog';
import FixedBannerCropModal from './FixedBannerCropModal';

type CampaignDraft = Omit<Campaign, 'id' | 'created_at' | 'updated_at'>;

const blankCampaign: CampaignDraft = {
  name: '', slug: '', eyebrow: 'LIMITED EDITION', title: '', description: '', hero_image: '',
  status: 'draft', start_at: null, end_at: null, theme_color: '#702838',
};

// 活動頁輪播圖比例(和首頁模板的圖片尺寸選項一致)
const HERO_RATIOS = [
  { key: 'portrait', label: '直式 4:5(1080 × 1350 px)', w: 1080, h: 1350, cls: 'aspect-[4/5]' },
  { key: 'square', label: '正方形 1:1(1200 × 1200 px)', w: 1200, h: 1200, cls: 'aspect-square' },
  { key: 'wide', label: '橫式 16:9(1600 × 900 px)', w: 1600, h: 900, cls: 'aspect-[16/9]' },
] as const;

const STATUS_LABEL: Record<Campaign['status'], string> = { draft: '草稿', published: '已發布', archived: '已封存' };

// 完整的活動頁網址(依目前網域,例如 https://urbanite.com.tw/promo/xxx)
function campaignUrl(slug: string) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/promo/${slug}`;
}

function dateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : '';
}

// 活動商品就是主站商品表裡標記 campaign_id 的商品;新增/編輯沿用主站的商品表單(由 AdminDashboard 提供)。
export default function CampaignManager({
  initialCampaigns,
  products,
  onNewProduct,
  onEditProduct,
  onDeleteProduct,
  onCampaignDeleted,
  categories = [],
  onCategoriesChange,
  onReorder,
  onProductChange,
}: {
  initialCampaigns: Campaign[];
  products: Product[];
  onNewProduct: (campaignId: string) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onCampaignDeleted: (campaignId: string) => void;
  categories?: Category[]; // 促銷活動頁專屬分類(所有活動)
  onCategoriesChange?: (list: Category[]) => void;
  onReorder?: (ordered: Product[]) => void;
  onProductChange?: (product: Product) => void;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState(initialCampaigns[0]?.id ?? '');
  const selected = campaigns.find((campaign) => campaign.id === selectedId) ?? null;
  const [newOpen, setNewOpen] = useState(initialCampaigns.length === 0);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>(blankCampaign);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [copiedSlug, setCopiedSlug] = useState('');

  const campaignProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((product) => product.campaign_id === selectedId)
      .filter((product) => !q || [product.name, product.id, product.category].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [products, query, selectedId]);

  // 活動專屬分類(和主站分類分開)
  const campaignCats = categories.filter((c) => c.campaign_id === selectedId).sort((a, b) => a.sort_order - b.sort_order);
  const catName = (slug: string) => campaignCats.find((c) => c.slug === slug)?.name ?? (slug || '未分類');
  const [catTab, setCatTab] = useState('all'); // 商品列表的分類分頁
  const [previewOpen, setPreviewOpen] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  useEffect(() => (previewOpen ? lockScroll() : undefined), [previewOpen]);
  // 商品排序:長按(手機)或按住把手拖曳;只能在「全部」且沒有搜尋時排序
  const sortable = !query.trim() && catTab === 'all';
  const reorder = useLongPressReorder(campaignProducts.map((p) => p.id), (ids) => {
    const ordered = ids.map((id) => campaignProducts.find((p) => p.id === id)!).filter(Boolean);
    onReorder?.(ordered);
    void Promise.all(ordered.map((p, i) => (p.sort_order === i ? null : fetch(`/api/products/${encodeURIComponent(p.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: i }),
    })))).then((results) => { if (results.some((r) => r && !r.ok)) flash('排序儲存失敗,請重新整理後再試'); else flash('已更新商品排序'); });
  });
  const shownProducts = reorder.order.map((id) => campaignProducts.find((p) => p.id === id)!).filter(Boolean)
    .filter((p) => catTab === 'all' || (catTab === 'none' ? !campaignCats.some((c) => c.slug === p.category) : p.category === catTab));
  const countOf = (tab: string) => campaignProducts.filter((p) => tab === 'none' ? !campaignCats.some((c) => c.slug === p.category) : p.category === tab).length;

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(campaignUrl(slug));
      setCopiedSlug(slug);
      window.setTimeout(() => setCopiedSlug((current) => (current === slug ? '' : current)), 2000);
    } catch {
      flash('無法複製，請長按連結手動複製');
    }
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  async function upload(file: File, folder: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('productId', selected?.slug || campaignDraft.slug || 'campaign');
    form.append('folder', folder);
    const response = await fetch('/api/products/image', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? '圖片上傳失敗');
    return String(data.image_url);
  }

  async function createCampaign() {
    if (!campaignDraft.name.trim() || !campaignDraft.slug.trim()) return flash('請填寫活動名稱與網址');
    setBusy(true);
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campaignDraft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '建立失敗');
      setCampaigns((items) => [data, ...items]);
      setSelectedId(data.id);
      setCampaignDraft(blankCampaign);
      setNewOpen(false);
      flash('已建立促銷專頁');
    } catch (error) { flash(error instanceof Error ? error.message : '建立失敗'); }
    finally { setBusy(false); }
  }

  async function updateCampaign(patch: Partial<Campaign>) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '儲存失敗');
      setCampaigns((items) => items.map((item) => item.id === data.id ? data : item));
      flash('頁面設定已儲存');
    } catch (error) { flash(error instanceof Error ? error.message : '儲存失敗'); }
    finally { setBusy(false); }
  }

  async function removeCampaign() {
    if (!selected || !(await uiConfirm(`確定刪除「${selected.name}」與所有活動商品嗎？`, { danger: true }))) return;
    const response = await fetch(`/api/campaigns/${selected.id}`, { method: 'DELETE' });
    if (!response.ok) return flash('刪除失敗');
    const next = campaigns.filter((item) => item.id !== selected.id);
    setCampaigns(next);
    onCampaignDeleted(selected.id);
    setSelectedId(next[0]?.id ?? '');
    if (!next.length) setNewOpen(true);
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[.22em] text-[#9b3048]">CAMPAIGN PAGE</p>
          <h2 className="mt-1 font-serif-tc text-[28px] font-bold">促銷活動頁</h2>
          <p className="mt-1 text-sm text-[#8a7f72]">活動商品與主站完全分開，搜尋與分類只顯示目前活動內容。</p>
        </div>
        <button type="button" onClick={() => setNewOpen(true)} className="rounded-md bg-[#1f1b19] px-5 py-2.5 text-sm font-semibold text-white">＋ 新增專頁</button>
      </div>

      {notice ? <div className="fixed right-5 top-5 z-[90] rounded-md bg-[#1f1b19] px-4 py-3 text-sm text-white shadow-xl">{notice}</div> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border border-[#e5ded4] bg-white p-3">
          <p className="px-2 pb-2 text-xs font-semibold text-[#8a7f72]">活動清單</p>
          <div className="space-y-1">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className={`border-l-2 px-3 py-3 transition ${selectedId === campaign.id ? 'border-[#8f1935] bg-[#faf3f4]' : 'border-transparent hover:bg-[#faf7f2]'}`}>
                <button type="button" onClick={() => setSelectedId(campaign.id)} className="flex w-full items-center justify-between gap-2 text-left">
                  <span className="truncate text-sm font-semibold">{campaign.name}</span>
                  <span className="shrink-0 text-xs text-[#8a7f72]">{STATUS_LABEL[campaign.status]}</span>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <a href={campaignUrl(campaign.slug)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-[#702838] underline underline-offset-2">{campaignUrl(campaign.slug)}</a>
                  <button type="button" onClick={() => copyLink(campaign.slug)} className="shrink-0 rounded border border-[#d8d0c6] bg-white px-2 py-1 text-xs font-semibold text-[#6b6156] hover:border-[#702838] hover:text-[#702838]">{copiedSlug === campaign.slug ? '已複製' : '複製'}</button>
                </div>
              </div>
            ))}
            {!campaigns.length ? <p className="px-3 py-8 text-center text-sm text-[#a99e8f]">尚未建立活動</p> : null}
          </div>
        </aside>

        {selected ? (
          <div className="min-w-0 space-y-5">
            <CampaignSettings key={selected.id} campaign={selected} busy={busy} onSave={updateCampaign} onUpload={async (file, ratio) => {
              setBusy(true);
              try { const url = await upload(file, 'campaigns'); await updateCampaign({ hero_image: url, hero_ratio: ratio }); return url; }
              catch (error) { flash(error instanceof Error ? error.message : '上傳失敗'); }
              finally { setBusy(false); }
              return '';
            }} onDelete={removeCampaign} />

            <section className="min-w-0 border border-[#e5ded4] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-lg font-bold">活動商品</h3><p className="text-xs text-[#8a7f72]">欄位與主站商品相同；不會出現在主站商品列表或主站搜尋。</p></div>
                <button type="button" onClick={() => onNewProduct(selected.id)} className="rounded-md bg-[#702838] px-4 py-2 text-sm font-semibold text-white">＋ 新增活動商品</button>
              </div>
              <div className="mt-4 rounded-md bg-[#faf7f2] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">活動分類</p>
                    <p className="text-xs text-[#8a7f72]">只用在這個活動頁,和主站分類分開。</p>
                  </div>
                  <button type="button" onClick={() => setCatManagerOpen(true)} className="shrink-0 rounded-md bg-[#702838] px-3 py-2 text-xs font-semibold text-white">分類管理</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {campaignCats.map((c) => <span key={c.id} className={`rounded-full border border-[#d8d0c6] bg-white px-3 py-1 text-xs ${c.sort_order < 0 ? 'opacity-50' : ''}`}>{c.name}</span>)}
                  {!campaignCats.length ? <span className="text-xs text-[#a99e8f]">尚未建立分類,按「分類管理」新增</span> : null}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋此活動的商品、代碼或分類" className="h-11 flex-1 border border-[#d8d0c6] px-3 text-sm outline-none focus:border-[#702838]" />
                <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex h-11 shrink-0 items-center border border-[#702838] px-4 text-sm font-semibold text-[#702838]">預覽頁面</button>
              </div>
              <div className="mt-3 flex w-full max-w-full min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                {[{ key: 'all', label: '全部', n: campaignProducts.length }, ...campaignCats.map((c) => ({ key: c.slug, label: c.name, n: countOf(c.slug) })), { key: 'none', label: '未分類', n: countOf('none') }].map((t) => (
                  <button key={t.key} type="button" onClick={() => setCatTab(t.key)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${catTab === t.key ? 'bg-[#702838] text-white' : 'border border-[#d8d0c6] bg-white text-[#6b6156]'}`}>{t.label} {t.n}</button>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#8a7f72]">{sortable ? '長按商品(或按住左側 ⋮⋮)上下拖曳排序,活動頁依這個順序顯示。' : '切到「全部」並清除搜尋後可以拖曳排序。'}</p>
              <div ref={reorder.listRef} className="mt-2 divide-y divide-[#eee7de] border-y border-[#eee7de]">
                {shownProducts.map((product) => (
                  <div key={product.id} data-sort-row onPointerDown={sortable ? (e) => reorder.start(e, product.id) : undefined} onContextMenu={(e) => e.preventDefault()} className={`grid grid-cols-[18px_64px_minmax(0,1fr)_auto] items-center gap-3 py-3 select-none [-webkit-touch-callout:none] ${reorder.sorting === product.id ? 'bg-[#faf3ea] shadow-md' : ''}`}>
                    <span onPointerDown={sortable ? (e) => { e.stopPropagation(); reorder.start(e, product.id, true); } : undefined} className={`touch-none text-center text-[#b3a897] ${sortable ? 'cursor-grab' : 'opacity-30'}`} aria-hidden="true">⋮⋮</span>
                    <div className="h-16 bg-[#f5f1eb]">{product.image ? <img src={product.image} alt="" className="h-full w-full object-contain" /> : null}</div>
                    <div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="mt-1 text-xs text-[#8a7f72]">{product.id} · {catName(product.category)} · NT$ {product.price.toLocaleString()} · 庫存 {product.inventory} · {product.status}</p></div>
                    <div className="flex gap-2"><button type="button" onClick={() => onEditProduct(product)} className="border border-[#d8d0c6] px-3 py-1.5 text-xs font-semibold">編輯</button><button type="button" onClick={() => onDeleteProduct(product.id)} className="px-2 text-xs text-[#b23a3a]">刪除</button></div>
                  </div>
                ))}
                {!shownProducts.length ? <p className="py-10 text-center text-sm text-[#a99e8f]">{campaignProducts.length ? '這個分類沒有商品。' : '這個活動還沒有商品。'}</p> : null}
              </div>
            </section>
          </div>
        ) : <div className="border border-dashed border-[#d8d0c6] bg-white p-16 text-center text-[#8a7f72]">建立一個促銷專頁開始編輯。</div>}
      </div>

      {catManagerOpen && selected ? (
        <CampaignCategoryManager
          campaignId={selected.id}
          campaignName={selected.name || selected.title}
          categories={categories}
          products={products.filter((p) => p.campaign_id === selected.id)}
          onCategoriesChange={(list) => onCategoriesChange?.(list)}
          onProductChange={(p) => onProductChange?.(p)}
          onClose={() => setCatManagerOpen(false)}
        />
      ) : null}

      {previewOpen && selected ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-0 sm:p-6" onClick={() => setPreviewOpen(false)}>
          <div className="relative flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-white sm:h-[90dvh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e5ded4] px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold">預覽:{selected.name || selected.title}</p>
              <button type="button" onClick={() => setPreviewOpen(false)} aria-label="關閉預覽" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1f1b19] text-lg text-white">×</button>
            </div>
            <iframe title="活動頁預覽" src={`/promo/${selected.slug}?preview=1`} className="min-h-0 w-full flex-1 border-0" />
          </div>
        </div>
      ) : null}

      {newOpen ? <CampaignCreateModal draft={campaignDraft} busy={busy} onChange={setCampaignDraft} onClose={() => campaigns.length ? setNewOpen(false) : null} onCreate={createCampaign} /> : null}
    </div>
  );
}

function CampaignSettings({ campaign, busy, onSave, onUpload, onDelete }: { campaign: Campaign; busy: boolean; onSave: (patch: Partial<Campaign>) => void; onUpload: (file: File, ratio: NonNullable<Campaign['hero_ratio']>) => Promise<string>; onDelete: () => void }) {
  const [draft, setDraft] = useState(campaign);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const heroRatio = HERO_RATIOS.find((r) => r.key === (draft.hero_ratio ?? 'portrait')) ?? HERO_RATIOS[0];
  return <section className="border border-[#e5ded4] bg-white p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-lg font-bold">頁面設定</h3><p className="truncate text-xs text-[#8a7f72]">公開網址：/promo/{campaign.slug}</p></div>
      {/* 狀態選單:草稿 / 發布 / 封存,刪除也放在這裡 */}
      <select aria-label="狀態" value={draft.status} onChange={(e) => { if (e.target.value === '__delete') { e.target.value = draft.status; onDelete(); return; } setDraft({ ...draft, status: e.target.value as Campaign['status'] }); }} className="h-10 shrink-0 border border-[#d8d0c6] bg-white px-3 text-sm font-semibold"><option value="draft">草稿</option><option value="published">發布</option><option value="archived">封存</option><option disabled>──────</option><option value="__delete">刪除活動</option></select>
    </div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="後台活動名稱"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
      <Field label="活動網址"><input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></Field>
      <Field label="開始時間"><input type="datetime-local" value={dateInput(draft.start_at)} onChange={(e) => setDraft({ ...draft, start_at: e.target.value || null })} /></Field>
      <Field label="結束時間"><input type="datetime-local" value={dateInput(draft.end_at)} onChange={(e) => setDraft({ ...draft, end_at: e.target.value || null })} /></Field>
      <Field label="主色"><input type="color" value={draft.theme_color} onChange={(e) => setDraft({ ...draft, theme_color: e.target.value })} className="h-11" /></Field>
      <Field label="頁面說明" className="sm:col-span-2"><textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
      <Field label="輪播圖尺寸" className="sm:col-span-2"><select value={draft.hero_ratio ?? 'portrait'} onChange={(e) => { const hero_ratio = e.target.value as NonNullable<Campaign['hero_ratio']>; setDraft({ ...draft, hero_ratio }); onSave({ hero_ratio }); }} className="h-11 w-full border border-[#d8d0c6] bg-white px-3 text-sm">{HERO_RATIOS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select><p className="mt-1 text-xs text-[#8a7f72]">先選尺寸再上傳,裁切框會照這個比例;建議上傳 {heroRatio.w} × {heroRatio.h} px 以上。換尺寸會立即套用,請重新上傳符合比例的首圖。</p></Field>
      <Field label="首圖(輪播圖)" className="sm:col-span-2"><div className="flex flex-wrap items-center gap-3">{draft.hero_image ? <img src={draft.hero_image} alt="" className={`h-24 bg-[#f5f1eb] object-cover ${heroRatio.cls}`} /> : null}<label className="cursor-pointer border border-[#d8d0c6] px-4 py-2 text-sm font-semibold">上傳首圖<input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setCropFile(file); }} /></label><button type="button" disabled={busy} onClick={(e) => { e.preventDefault(); onSave(draft); }} className="ml-auto rounded-md bg-[#1f1b19] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">儲存設定</button></div></Field>
    </div>
    {cropFile ? (
      <FixedBannerCropModal
        file={cropFile}
        busy={uploading}
        title={`活動頁首圖 — ${heroRatio.label}`}
        outputW={heroRatio.w}
        outputH={heroRatio.h}
        hint={`輸出 ${heroRatio.w} × ${heroRatio.h} px`}
        onCancel={() => setCropFile(null)}
        onConfirm={async (blob, filename) => {
          setUploading(true);
          try {
            const url = await onUpload(new File([blob], filename, { type: 'image/jpeg' }), draft.hero_ratio ?? 'portrait');
            if (url) setDraft((current) => ({ ...current, hero_image: url }));
            setCropFile(null);
          } finally {
            setUploading(false);
          }
        }}
      />
    ) : null}
  </section>;
}

function CampaignCreateModal({ draft, busy, onChange, onClose, onCreate }: { draft: CampaignDraft; busy: boolean; onChange: (draft: CampaignDraft) => void; onClose: () => void; onCreate: () => void }) {
  return <Modal title="新增促銷活動頁" onClose={onClose}><div className="grid gap-4"><Field label="活動名稱"><input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value, title: draft.title || e.target.value })} placeholder="例如：秋季限定優惠" /></Field><Field label="網址代稱"><input value={draft.slug} onChange={(e) => onChange({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="autumn-sale" /></Field><p className="text-xs text-[#8a7f72]">建立後網址為 /promo/{draft.slug || '活動網址'}，商品將在下一步新增。</p><button type="button" disabled={busy} onClick={onCreate} className="h-11 bg-[#702838] font-semibold text-white disabled:opacity-50">建立並開始編輯</button></div></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-[#fffdfa] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-xl font-bold">{title}</h3><button type="button" onClick={onClose} aria-label="關閉" className="text-2xl">×</button></div>{children}</div></div>;
}

function Field({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`block text-sm font-semibold text-[#6b6156] ${className}`}><span className="mb-1.5 block">{label}</span><div className="[&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:max-w-full [&_input]:appearance-none [&_input]:border [&_input]:border-[#d8d0c6] [&_input]:bg-white [&_input]:px-3 [&_input]:font-normal [&_select]:h-11 [&_select]:w-full [&_select]:border [&_select]:border-[#d8d0c6] [&_select]:bg-white [&_select]:px-3 [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[#d8d0c6] [&_textarea]:bg-white [&_textarea]:p-3 [&_textarea]:font-normal">{children}</div></label>;
}
