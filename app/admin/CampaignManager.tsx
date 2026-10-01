'use client';

import { type ReactNode, useMemo, useState } from 'react';
import type { Campaign, CampaignProduct, SpecDim, Variant } from '@/lib/types';
import { uiConfirm } from '@/lib/ui-dialog';

type CampaignDraft = Omit<Campaign, 'id' | 'created_at' | 'updated_at'>;
type ProductDraft = {
  id?: string;
  sku: string;
  name: string;
  tagline: string;
  price: number;
  original_price: number;
  inventory: number; // 無規格時使用
  status: string;
  category: string;
  image: string;
  images: string[];
  unit: string;
  sale_mode: string;
  available_payment_methods: string[];
  available_shipping_methods: string[];
  shipping_fee_overrides: Record<string, number>;
  specs: { name: string; optionsText: string }[]; // 規格維度(選項以逗號分隔)
  variantStock: Record<string, number>; // 各規格組合庫存,key = options.join(' / ')
  sort_order: number;
};

const blankCampaign: CampaignDraft = {
  name: '', slug: '', eyebrow: 'LIMITED EDITION', title: '', description: '', hero_image: '',
  status: 'draft', start_at: null, end_at: null, theme_color: '#702838',
};

const blankProduct: ProductDraft = {
  sku: '', name: '', tagline: '', price: 0, original_price: 0, inventory: 0,
  status: '上架中', category: '', image: '', images: [], unit: '', sale_mode: '現貨',
  available_payment_methods: [], available_shipping_methods: [], shipping_fee_overrides: {},
  specs: [], variantStock: {}, sort_order: 0,
};

const SALE_MODES = ['現貨', '預購', '預購+現貨'];
const MAX_IMAGES = 10;

function dateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : '';
}

function parseOptions(value: string) {
  return value.split(/[,，、\n]+/).map((item) => item.trim()).filter(Boolean);
}

// 由規格維度算出所有組合(笛卡兒積)
function comboList(specs: SpecDim[]): string[][] {
  const valid = specs.filter((spec) => spec.options.length > 0);
  if (!valid.length) return [];
  return valid.reduce<string[][]>(
    (acc, dim) => acc.flatMap((combo) => dim.options.map((option) => [...combo, option])),
    [[]],
  );
}

// 把表單草稿的規格維度 + 各組合庫存,整理成要存檔的 specs / variants / 總庫存
function buildVariants(draft: ProductDraft) {
  const specs: SpecDim[] = draft.specs
    .map((spec) => ({ name: spec.name.trim(), options: parseOptions(spec.optionsText) }))
    .filter((spec) => spec.name && spec.options.length > 0);
  const combos = comboList(specs);
  const variants: Variant[] = combos.map((options) => ({
    options,
    inventory: Math.max(0, Math.floor(Number(draft.variantStock[options.join(' / ')] ?? 0))),
  }));
  const inventory = variants.length
    ? variants.reduce((sum, variant) => sum + variant.inventory, 0)
    : Math.max(0, Math.floor(Number(draft.inventory) || 0));
  return { specs, variants, inventory };
}

export default function CampaignManager({
  initialCampaigns,
  initialProducts,
  paymentMethods = [],
  shippingMethods = [],
  shippingFees = [],
}: {
  initialCampaigns: Campaign[];
  initialProducts: CampaignProduct[];
  paymentMethods?: string[];
  shippingMethods?: string[];
  shippingFees?: { name: string; fee: number }[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [products, setProducts] = useState(initialProducts);
  const [selectedId, setSelectedId] = useState(initialCampaigns[0]?.id ?? '');
  const selected = campaigns.find((campaign) => campaign.id === selectedId) ?? null;
  const [newOpen, setNewOpen] = useState(initialCampaigns.length === 0);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>(blankCampaign);
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const campaignProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((product) => product.campaign_id === selectedId)
      .filter((product) => !q || [product.name, product.sku, product.category].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [products, query, selectedId]);

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

  async function saveProduct() {
    if (!selected || !productDraft?.name.trim()) return flash('請填寫商品名稱');
    setBusy(true);
    const { specs, variants, inventory } = buildVariants(productDraft);
    const { variantStock: _variantStock, specs: _specs, ...rest } = productDraft;
    const images = productDraft.images.length ? productDraft.images : productDraft.image ? [productDraft.image] : [];
    const payload = {
      campaign_id: selected.id,
      ...rest,
      original_price: productDraft.original_price || null,
      image: images[0] ?? '',
      images,
      specs,
      variants,
      inventory,
    };
    try {
      const response = await fetch(productDraft.id ? `/api/campaign-products/${productDraft.id}` : '/api/campaign-products', {
        method: productDraft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '商品儲存失敗');
      setProducts((items) => productDraft.id ? items.map((item) => item.id === data.id ? data : item) : [...items, data]);
      setProductDraft(null);
      flash('活動商品已儲存');
    } catch (error) { flash(error instanceof Error ? error.message : '商品儲存失敗'); }
    finally { setBusy(false); }
  }

  function editProduct(product: CampaignProduct) {
    const variantStock: Record<string, number> = {};
    (product.variants ?? []).forEach((variant) => {
      variantStock[variant.options.join(' / ')] = variant.inventory;
    });
    setProductDraft({
      id: product.id, sku: product.sku, name: product.name, tagline: product.tagline,
      price: product.price, original_price: product.original_price ?? 0, inventory: product.inventory,
      status: product.status, category: product.category, image: product.image, images: product.images ?? [],
      unit: product.unit ?? '', sale_mode: product.sale_mode ?? '現貨',
      available_payment_methods: product.available_payment_methods ?? [],
      available_shipping_methods: product.available_shipping_methods ?? [],
      shipping_fee_overrides: product.shipping_fee_overrides ?? {},
      specs: (product.specs ?? []).map((spec) => ({ name: spec.name, optionsText: spec.options.join(', ') })),
      variantStock,
      sort_order: product.sort_order,
    });
  }

  async function removeProduct(product: CampaignProduct) {
    if (!(await uiConfirm(`確定刪除活動商品「${product.name}」嗎？`, { danger: true }))) return;
    const response = await fetch(`/api/campaign-products/${product.id}`, { method: 'DELETE' });
    if (!response.ok) return flash('商品刪除失敗');
    setProducts((items) => items.filter((item) => item.id !== product.id));
    flash('商品已刪除');
  }

  async function removeCampaign() {
    if (!selected || !(await uiConfirm(`確定刪除「${selected.name}」與所有活動商品嗎？`, { danger: true }))) return;
    const response = await fetch(`/api/campaigns/${selected.id}`, { method: 'DELETE' });
    if (!response.ok) return flash('刪除失敗');
    const next = campaigns.filter((item) => item.id !== selected.id);
    setCampaigns(next);
    setProducts((items) => items.filter((item) => item.campaign_id !== selected.id));
    setSelectedId(next[0]?.id ?? '');
    if (!next.length) setNewOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[.22em] text-[#9b3048]">CAMPAIGN PAGE</p>
          <h2 className="mt-1 font-serif-tc text-[28px] font-bold">一頁式促銷專頁</h2>
          <p className="mt-1 text-sm text-[#8a7f72]">活動商品與主站完全分開，搜尋與分類只顯示目前活動內容。</p>
        </div>
        <button type="button" onClick={() => setNewOpen(true)} className="rounded-md bg-[#1f1b19] px-5 py-2.5 text-sm font-semibold text-white">＋ 新增專頁</button>
      </div>

      {notice ? <div className="fixed right-5 top-5 z-[90] rounded-md bg-[#1f1b19] px-4 py-3 text-sm text-white shadow-xl">{notice}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border border-[#e5ded4] bg-white p-3">
          <p className="px-2 pb-2 text-xs font-semibold text-[#8a7f72]">活動清單</p>
          <div className="space-y-1">
            {campaigns.map((campaign) => (
              <button key={campaign.id} type="button" onClick={() => setSelectedId(campaign.id)} className={`w-full border-l-2 px-3 py-3 text-left transition ${selectedId === campaign.id ? 'border-[#8f1935] bg-[#faf3f4]' : 'border-transparent hover:bg-[#faf7f2]'}`}>
                <span className="block truncate text-sm font-semibold">{campaign.name}</span>
                <span className="mt-1 flex items-center justify-between text-xs text-[#8a7f72]"><span>/{campaign.slug}</span><span>{campaign.status === 'published' ? '已發布' : '草稿'}</span></span>
              </button>
            ))}
            {!campaigns.length ? <p className="px-3 py-8 text-center text-sm text-[#a99e8f]">尚未建立活動</p> : null}
          </div>
        </aside>

        {selected ? (
          <div className="space-y-5">
            <CampaignSettings key={selected.id} campaign={selected} busy={busy} onSave={updateCampaign} onUpload={async (file) => {
              setBusy(true);
              try { const url = await upload(file, 'campaigns'); await updateCampaign({ hero_image: url }); return url; }
              catch (error) { flash(error instanceof Error ? error.message : '上傳失敗'); }
              finally { setBusy(false); }
              return '';
            }} onDelete={removeCampaign} />

            <section className="border border-[#e5ded4] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-lg font-bold">活動商品</h3><p className="text-xs text-[#8a7f72]">不會出現在主站商品列表或主站搜尋。</p></div>
                <button type="button" onClick={() => setProductDraft(blankProduct)} className="rounded-md bg-[#702838] px-4 py-2 text-sm font-semibold text-white">＋ 新增活動商品</button>
              </div>
              <div className="mt-4 flex gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋此活動的商品、編號或分類" className="h-11 flex-1 border border-[#d8d0c6] px-3 text-sm outline-none focus:border-[#702838]" />
                <a href={`/promo/${selected.slug}?preview=1`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center border border-[#702838] px-4 text-sm font-semibold text-[#702838]">預覽頁面 ↗</a>
              </div>
              <div className="mt-4 divide-y divide-[#eee7de] border-y border-[#eee7de]">
                {campaignProducts.map((product) => (
                  <div key={product.id} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                    <div className="h-16 bg-[#f5f1eb]">{product.image ? <img src={product.image} alt="" className="h-full w-full object-contain" /> : null}</div>
                    <div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="mt-1 text-xs text-[#8a7f72]">{product.sku || '無編號'} · {product.category || '未分類'} · NT$ {product.price.toLocaleString()} · 庫存 {product.inventory}</p></div>
                    <div className="flex gap-2"><button type="button" onClick={() => editProduct(product)} className="border border-[#d8d0c6] px-3 py-1.5 text-xs font-semibold">編輯</button><button type="button" onClick={() => removeProduct(product)} className="px-2 text-xs text-[#b23a3a]">刪除</button></div>
                  </div>
                ))}
                {!campaignProducts.length ? <p className="py-10 text-center text-sm text-[#a99e8f]">這個活動還沒有商品。</p> : null}
              </div>
            </section>
          </div>
        ) : <div className="border border-dashed border-[#d8d0c6] bg-white p-16 text-center text-[#8a7f72]">建立一個促銷專頁開始編輯。</div>}
      </div>

      {newOpen ? <CampaignCreateModal draft={campaignDraft} busy={busy} onChange={setCampaignDraft} onClose={() => campaigns.length ? setNewOpen(false) : null} onCreate={createCampaign} /> : null}
      {productDraft ? <ProductModal draft={productDraft} busy={busy} paymentMethods={paymentMethods} shippingMethods={shippingMethods} shippingFees={shippingFees} onChange={setProductDraft} onClose={() => setProductDraft(null)} onSave={saveProduct} uploadImage={(file) => upload(file, 'campaign-products')} /> : null}
    </div>
  );
}

function CampaignSettings({ campaign, busy, onSave, onUpload, onDelete }: { campaign: Campaign; busy: boolean; onSave: (patch: Partial<Campaign>) => void; onUpload: (file: File) => Promise<string>; onDelete: () => void }) {
  const [draft, setDraft] = useState(campaign);
  return <section className="border border-[#e5ded4] bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">頁面設定</h3><p className="text-xs text-[#8a7f72]">公開網址：/promo/{campaign.slug}</p></div><div className="flex gap-2"><button type="button" onClick={onDelete} className="px-3 text-sm text-[#b23a3a]">刪除</button><button type="button" disabled={busy} onClick={() => onSave(draft)} className="rounded-md bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">儲存設定</button></div></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="後台活動名稱"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
      <Field label="活動網址"><input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></Field>
      <Field label="英文眉題"><input value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} /></Field>
      <Field label="主標題"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
      <Field label="開始時間"><input type="datetime-local" value={dateInput(draft.start_at)} onChange={(e) => setDraft({ ...draft, start_at: e.target.value || null })} /></Field>
      <Field label="結束時間"><input type="datetime-local" value={dateInput(draft.end_at)} onChange={(e) => setDraft({ ...draft, end_at: e.target.value || null })} /></Field>
      <Field label="狀態"><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Campaign['status'] })}><option value="draft">草稿</option><option value="published">發布</option><option value="archived">封存</option></select></Field>
      <Field label="主色"><input type="color" value={draft.theme_color} onChange={(e) => setDraft({ ...draft, theme_color: e.target.value })} className="h-11" /></Field>
      <Field label="頁面說明" className="sm:col-span-2"><textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
      <Field label="首圖" className="sm:col-span-2"><div className="flex items-center gap-3">{draft.hero_image ? <img src={draft.hero_image} alt="" className="h-20 w-32 bg-[#f5f1eb] object-cover" /> : null}<label className="cursor-pointer border border-[#d8d0c6] px-4 py-2 text-sm font-semibold">上傳首圖<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const url = await onUpload(file); if (url) setDraft((current) => ({ ...current, hero_image: url })); }} /></label></div></Field>
    </div>
  </section>;
}

function CampaignCreateModal({ draft, busy, onChange, onClose, onCreate }: { draft: CampaignDraft; busy: boolean; onChange: (draft: CampaignDraft) => void; onClose: () => void; onCreate: () => void }) {
  return <Modal title="新增一頁式促銷專頁" onClose={onClose}><div className="grid gap-4"><Field label="活動名稱"><input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value, title: draft.title || e.target.value })} placeholder="例如：秋季限定優惠" /></Field><Field label="網址代稱"><input value={draft.slug} onChange={(e) => onChange({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="autumn-sale" /></Field><p className="text-xs text-[#8a7f72]">建立後網址為 /promo/{draft.slug || '活動網址'}，商品將在下一步新增。</p><button type="button" disabled={busy} onClick={onCreate} className="h-11 bg-[#702838] font-semibold text-white disabled:opacity-50">建立並開始編輯</button></div></Modal>;
}

function ProductModal({ draft, busy, paymentMethods, shippingMethods, shippingFees, onChange, onClose, onSave, uploadImage }: { draft: ProductDraft; busy: boolean; paymentMethods: string[]; shippingMethods: string[]; shippingFees: { name: string; fee: number }[]; onChange: (draft: ProductDraft | null) => void; onClose: () => void; onSave: () => void; uploadImage: (file: File) => Promise<string> }) {
  const [uploading, setUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const specsForCombo: SpecDim[] = draft.specs
    .map((spec) => ({ name: spec.name.trim(), options: parseOptions(spec.optionsText) }))
    .filter((spec) => spec.name && spec.options.length > 0);
  const combos = comboList(specsForCombo);
  const totalStock = combos.length
    ? combos.reduce((sum, options) => sum + (Number(draft.variantStock[options.join(' / ')] ?? 0) || 0), 0)
    : draft.inventory;

  function setSpec(index: number, patch: Partial<{ name: string; optionsText: string }>) {
    onChange({ ...draft, specs: draft.specs.map((spec, i) => (i === index ? { ...spec, ...patch } : spec)) });
  }
  function addSpec() {
    onChange({ ...draft, specs: [...draft.specs, { name: '', optionsText: '' }] });
  }
  function removeSpec(index: number) {
    onChange({ ...draft, specs: draft.specs.filter((_, i) => i !== index) });
  }
  function setStock(key: string, value: number) {
    onChange({ ...draft, variantStock: { ...draft.variantStock, [key]: Math.max(0, value) } });
  }

  async function uploadImages(files: FileList) {
    const room = MAX_IMAGES - draft.images.length;
    if (room <= 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const url = await uploadImage(file);
        if (url) urls.push(url);
      }
      onChange({ ...draft, images: [...draft.images, ...urls].slice(0, MAX_IMAGES) });
    } finally {
      setUploading(false);
    }
  }
  function removeImage(index: number) {
    onChange({ ...draft, images: draft.images.filter((_, i) => i !== index) });
  }
  function makeCover(index: number) {
    if (index === 0) return;
    const imgs = [...draft.images];
    const [pick] = imgs.splice(index, 1);
    onChange({ ...draft, images: [pick, ...imgs] });
  }
  function addImageUrl() {
    const url = imageUrlInput.trim();
    if (!url || draft.images.length >= MAX_IMAGES) return;
    onChange({ ...draft, images: [...draft.images, url] });
    setImageUrlInput('');
  }
  function togglePayment(method: string, checked: boolean) {
    const current = draft.available_payment_methods.filter((m) => m !== method);
    onChange({ ...draft, available_payment_methods: checked ? [...current, method] : current });
  }
  function toggleShipping(method: string, checked: boolean) {
    const current = draft.available_shipping_methods.filter((m) => m !== method);
    onChange({ ...draft, available_shipping_methods: checked ? [...current, method] : current });
  }
  function setFeeOverride(method: string, value: string) {
    const next = { ...draft.shipping_fee_overrides };
    if (value.trim() === '') delete next[method];
    else next[method] = Math.max(0, Number(value) || 0);
    onChange({ ...draft, shipping_fee_overrides: next });
  }

  return <Modal title={draft.id ? '編輯活動商品' : '新增活動商品'} onClose={onClose}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="商品名稱" className="sm:col-span-2"><input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} /></Field>
      <Field label="商品編號"><input value={draft.sku} onChange={(e) => onChange({ ...draft, sku: e.target.value })} /></Field>
      <Field label="分類"><input value={draft.category} onChange={(e) => onChange({ ...draft, category: e.target.value })} placeholder="例如：外套" /></Field>
      <Field label="售價"><input type="number" min="0" value={draft.price} onChange={(e) => onChange({ ...draft, price: Number(e.target.value) })} /></Field>
      <Field label="原價"><input type="number" min="0" value={draft.original_price} onChange={(e) => onChange({ ...draft, original_price: Number(e.target.value) })} /></Field>
      <Field label="單位"><input value={draft.unit} onChange={(e) => onChange({ ...draft, unit: e.target.value })} placeholder="例如：件" /></Field>
      <Field label="銷售模式"><select value={draft.sale_mode} onChange={(e) => onChange({ ...draft, sale_mode: e.target.value })}>{SALE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></Field>
      <Field label="排序"><input type="number" value={draft.sort_order} onChange={(e) => onChange({ ...draft, sort_order: Number(e.target.value) })} /></Field>
      <Field label="簡介" className="sm:col-span-2"><textarea rows={2} value={draft.tagline} onChange={(e) => onChange({ ...draft, tagline: e.target.value })} /></Field>

      <div className="sm:col-span-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#6b6156]">規格維度</span>
          <button type="button" onClick={addSpec} className="text-xs font-semibold text-[#702838]">＋ 新增維度</button>
        </div>
        <div className="space-y-2">
          {draft.specs.map((spec, index) => (
            <div key={index} className="flex gap-2">
              <input value={spec.name} onChange={(e) => setSpec(index, { name: e.target.value })} placeholder="維度名稱（如 顏色）" className="h-11 w-32 border border-[#d8d0c6] bg-white px-3 text-sm" />
              <input value={spec.optionsText} onChange={(e) => setSpec(index, { optionsText: e.target.value })} placeholder="選項，逗號分隔（如 紅,綠,藍）" className="h-11 flex-1 border border-[#d8d0c6] bg-white px-3 text-sm" />
              <button type="button" onClick={() => removeSpec(index)} aria-label="刪除維度" className="px-2 text-lg text-[#b23a3a]">×</button>
            </div>
          ))}
          {!draft.specs.length ? <p className="text-xs text-[#a99e8f]">未設定規格維度時，下方填單一總庫存。</p> : null}
        </div>
      </div>

      <div className="sm:col-span-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#6b6156]">庫存{combos.length ? `（各規格組合，共 ${combos.length} 組）` : ''}</span>
          <span className="text-xs text-[#8a7f72]">合計 {totalStock}</span>
        </div>
        {combos.length ? (
          <div className="max-h-56 divide-y divide-[#eee7de] overflow-y-auto border border-[#eee7de]">
            {combos.map((options) => {
              const key = options.join(' / ');
              return <div key={key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm">{key}</span>
                <input type="number" min="0" value={draft.variantStock[key] ?? 0} onChange={(e) => setStock(key, Number(e.target.value))} className="h-9 w-24 border border-[#d8d0c6] bg-white px-2 text-sm" />
              </div>;
            })}
          </div>
        ) : (
          <input type="number" min="0" value={draft.inventory} onChange={(e) => onChange({ ...draft, inventory: Number(e.target.value) })} className="h-11 w-full border border-[#d8d0c6] bg-white px-3 text-sm" />
        )}
      </div>

      <div className="sm:col-span-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#6b6156]">商品圖片（最多 {MAX_IMAGES} 張,第一張為封面）</span>
          <span className="text-xs text-[#8a7f72]">{draft.images.length}/{MAX_IMAGES}</span>
        </div>
        {draft.images.length > 0 && (
          <div className="mb-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {draft.images.map((url, index) => (
              <div key={`${url}-${index}`} className="group relative aspect-square border border-[#e5ded4] bg-[#f5f1eb]">
                <img src={url} alt="" className="h-full w-full object-contain" />
                {index === 0 ? <span className="absolute left-1 top-1 bg-[#702838] px-1.5 py-0.5 text-[10px] font-semibold text-white">封面</span> : null}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                  {index !== 0 ? <button type="button" onClick={() => makeCover(index)} className="text-[10px] font-semibold text-white">設封面</button> : <span />}
                  <button type="button" onClick={() => removeImage(index)} className="text-[10px] font-semibold text-white">刪除</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`cursor-pointer border border-[#d8d0c6] px-4 py-2 text-sm font-semibold ${draft.images.length >= MAX_IMAGES ? 'pointer-events-none opacity-40' : ''}`}>
            {uploading ? '上傳中...' : '上傳圖片'}
            <input type="file" accept="image/*" multiple className="hidden" disabled={uploading || draft.images.length >= MAX_IMAGES} onChange={(e) => { if (e.target.files?.length) uploadImages(e.target.files); e.target.value = ''; }} />
          </label>
          <input value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addImageUrl(); } }} placeholder="或貼上圖片網址後按新增" className="h-11 flex-1 border border-[#d8d0c6] bg-white px-3 text-sm" />
          <button type="button" onClick={addImageUrl} className="border border-[#1f1b19] px-4 py-2 text-sm font-semibold">新增</button>
        </div>
      </div>

      <div className="sm:col-span-2">
        <p className="mb-1.5 text-sm font-semibold text-[#6b6156]">可用金流（未勾選=全部）</p>
        {paymentMethods.length ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {paymentMethods.map((method) => (
              <label key={method} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.available_payment_methods.includes(method)} onChange={(e) => togglePayment(method, e.target.checked)} />
                {method}
              </label>
            ))}
          </div>
        ) : <p className="text-sm text-[#8a7f72]">請先到系統設定新增金流方式。</p>}
      </div>

      <div className="sm:col-span-2">
        <p className="mb-1.5 text-sm font-semibold text-[#6b6156]">可用物流與運費（未勾選=全部;運費留空=用後台預設）</p>
        {shippingMethods.length ? (
          <div className="space-y-2">
            {shippingMethods.map((method) => {
              const override = draft.shipping_fee_overrides[method];
              const base = shippingFees.find((f) => f.name === method)?.fee;
              return (
                <div key={method} className="flex items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" checked={draft.available_shipping_methods.includes(method)} onChange={(e) => toggleShipping(method, e.target.checked)} />
                    {method}
                  </label>
                  <span className="text-xs text-[#8a7f72]">運費 NT$</span>
                  <input type="number" min="0" value={override ?? ''} placeholder={base != null ? String(base) : '預設'} onChange={(e) => setFeeOverride(method, e.target.value)} className="h-9 w-24 border border-[#d8d0c6] bg-white px-2 text-sm" />
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-[#8a7f72]">請先到系統設定新增物流方式。</p>}
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm">取消</button><button type="button" disabled={busy} onClick={onSave} className="bg-[#702838] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">儲存商品</button></div>
    </div>
  </Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-[#fffdfa] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-xl font-bold">{title}</h3><button type="button" onClick={onClose} aria-label="關閉" className="text-2xl">×</button></div>{children}</div></div>;
}

function Field({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`block text-sm font-semibold text-[#6b6156] ${className}`}><span className="mb-1.5 block">{label}</span><div className="[&_input]:h-11 [&_input]:w-full [&_input]:border [&_input]:border-[#d8d0c6] [&_input]:bg-white [&_input]:px-3 [&_input]:font-normal [&_select]:h-11 [&_select]:w-full [&_select]:border [&_select]:border-[#d8d0c6] [&_select]:bg-white [&_select]:px-3 [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[#d8d0c6] [&_textarea]:bg-white [&_textarea]:p-3 [&_textarea]:font-normal">{children}</div></label>;
}
