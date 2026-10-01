'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import ShopHeader from '@/app/components/ShopHeader';
import type { Campaign, CampaignProduct, SiteSettings } from '@/lib/types';
import { campaignProductCartId } from '@/lib/types';

const CART_KEY = 'cart';
const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

type CartItem = { id: string; productId: string; name: string; variant: string; price: number; quantity: number; source?: 'campaign'; campaignId?: string };

function readCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') as CartItem[]; }
  catch { return []; }
}

function soldOut(product: CampaignProduct) {
  if (product.sale_mode?.includes('預購')) return false;
  if (product.variants?.length) return product.variants.every((variant) => variant.inventory <= 0);
  return product.inventory <= 0;
}

export default function CampaignPageClient({ campaign, products, settings, preview }: { campaign: Campaign; products: CampaignProduct[]; settings: SiteSettings | null; preview: boolean }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<CampaignProduct | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.resolve().then(() => setCart(readCart()));
  }, []);
  const categories = useMemo(() => ['全部', ...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => (category === '全部' || product.category === category)
      && (!needle || [product.name, product.tagline, product.sku, product.category].join(' ').toLowerCase().includes(needle)));
  }, [category, products, query]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function add(product: CampaignProduct, variant: string, quantity: number) {
    const productId = campaignProductCartId(product.id);
    const id = `${productId}-${variant}`;
    const next = [...cart];
    const existing = next.find((item) => item.id === id);
    if (existing) existing.quantity += quantity;
    else next.push({ id, productId, name: product.name, variant, price: product.price, quantity, source: 'campaign', campaignId: campaign.id });
    setCart(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
    setSelected(null);
    setNotice('已加入購物車');
    window.setTimeout(() => setNotice(''), 2400);
  }

  return <main className="min-h-screen bg-[#f8f5ef] text-[#211d1a]" style={{ '--campaign-color': campaign.theme_color } as CSSProperties}>
    <ShopHeader logoUrl={settings?.logo_url ?? ''} showBack={false} logoLinked={false} cartCount={cartCount} />
    {preview ? <div className="bg-[#221f1d] px-4 py-2 text-center text-xs font-semibold tracking-widest text-white">草稿預覽模式</div> : null}

    <section className="relative min-h-[440px] overflow-hidden bg-[#ded7ce] sm:min-h-[560px]">
      {campaign.hero_image ? <img src={campaign.hero_image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative mx-auto flex min-h-[440px] max-w-6xl items-end px-5 pb-12 pt-24 sm:min-h-[560px] sm:px-8 sm:pb-16">
        <div className="max-w-2xl text-white [text-shadow:0_2px_18px_rgba(0,0,0,.35)]">
          <p className="text-xs font-semibold tracking-[.28em] sm:text-sm">{campaign.eyebrow}</p>
          <h1 className="mt-4 font-serif-tc text-4xl font-bold leading-tight sm:text-6xl">{campaign.title || campaign.name}</h1>
          {campaign.description ? <p className="mt-4 max-w-xl whitespace-pre-line text-sm leading-7 sm:text-base">{campaign.description}</p> : null}
        </div>
      </div>
    </section>

    <section className="sticky top-[73px] z-20 border-b border-[#ddd5ca] bg-[#fffdfa]/95 backdrop-blur sm:top-[81px]">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition ${category === item ? 'border-[var(--campaign-color)] text-[var(--campaign-color)]' : 'border-transparent text-[#746a60]'}`}>{item}</button>)}
        </div>
        <label className="mt-3 flex h-11 items-center border border-[#d8d0c6] bg-white px-3">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜尋 ${campaign.name} 的商品`} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" />
          {query ? <button type="button" onClick={() => setQuery('')} className="text-xs text-[#8a7f72]">清除</button> : null}
        </label>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-7 flex items-end justify-between gap-4"><div><p className="text-xs tracking-[.22em] text-[#8a7f72]">CAMPAIGN COLLECTION</p><h2 className="mt-2 text-2xl font-bold">{category === '全部' ? '活動商品' : category}</h2></div><p className="text-sm text-[#8a7f72]">{shown.length} 件商品</p></div>
      {shown.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((product) => {
          const out = soldOut(product);
          return <div key={product.id} className="group flex flex-col overflow-hidden rounded-lg bg-[#f9f8f6] p-3 shadow-sm hover:shadow-md">
            <button type="button" onClick={() => setSelected(product)} aria-label={`查看 ${product.name}`} className="relative aspect-[3/4] overflow-hidden rounded-[6px] bg-white">
              {product.image ? <img src={product.image} alt={product.name} className={`h-full w-full object-contain drop-shadow-[0_14px_16px_rgba(31,27,25,0.22)] transition duration-500 group-hover:scale-[1.03] ${out ? 'opacity-60' : ''}`} /> : <span className="flex h-full items-center justify-center text-xs text-[#a99e8f]">尚未上傳圖片</span>}
            </button>
            <div className="mt-3 flex flex-1 flex-col px-1">
              <button type="button" onClick={() => setSelected(product)} className="text-left hover:text-[#c84767]">
                <h3 className="line-clamp-1 text-sm font-semibold leading-5">{product.name}</h3>
                {product.tagline ? <p className="mt-1 line-clamp-1 text-xs text-[#8a7f72]">{product.tagline}</p> : null}
              </button>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-baseline gap-2"><span className="font-semibold tracking-wide">{formatter.format(product.price)}</span>{product.original_price ? <span className="text-xs text-[#b3a897] line-through">{formatter.format(product.original_price)}</span> : null}</div>
                {out ? <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-[#b5a9a0] px-3 text-center text-[10px] font-bold leading-[1.05] tracking-[0.08em] text-white">SOLD<br />OUT</span>
                  : <button type="button" onClick={() => setSelected(product)} aria-label={`將 ${product.name} 加入購物車`} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f1b19] text-white transition hover:bg-[#3a322e]"><IconCart /></button>}
              </div>
            </div>
          </div>;
        })}
      </div> : <div className="border-y border-[#ddd5ca] py-20 text-center text-[#8a7f72]">找不到符合條件的活動商品。</div>}
    </section>

    <footer className="border-t border-[#ddd5ca] bg-[#f1ece5] px-4 py-12 text-center"><p className="text-sm font-semibold tracking-[.2em]">{campaign.name}</p><p className="mt-2 text-xs text-[#8a7f72]">URBANITE CUSTOM WEAR</p></footer>
    {selected ? <ProductPicker product={selected} color={campaign.theme_color} onClose={() => setSelected(null)} onAdd={add} /> : null}
    <div aria-live="polite" className={`fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 bg-[#1f1b19] px-5 py-3 text-sm font-semibold text-white shadow-xl transition ${notice ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}>{notice}</div>
  </main>;
}

function IconCart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProductPicker({ product, color, onClose, onAdd }: { product: CampaignProduct; color: string; onClose: () => void; onAdd: (product: CampaignProduct, variant: string, quantity: number) => void }) {
  const options = product.variants?.length ? product.variants.filter((variant) => product.sale_mode?.includes('預購') || variant.inventory > 0).map((variant) => variant.options.join(' / ')) : ['標準款'];
  const [variant, setVariant] = useState(options[0] ?? '');
  const [quantity, setQuantity] = useState(1);
  const unavailable = soldOut(product) || !variant;
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto bg-[#fffdfa] shadow-2xl"><div className="grid sm:grid-cols-2"><div className="aspect-square bg-white">{product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-contain p-5" /> : null}</div><div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[#8a7f72]">{product.sku}</p><h2 className="mt-1 text-xl font-bold">{product.name}</h2></div><button type="button" onClick={onClose} aria-label="關閉" className="text-2xl">×</button></div><p className="mt-3 text-lg font-semibold">{formatter.format(product.price)}</p>{product.tagline ? <p className="mt-3 text-sm leading-6 text-[#6b6156]">{product.tagline}</p> : null}<div className="mt-6"><p className="mb-2 text-xs font-semibold text-[#6b6156]">選擇規格</p><div className="flex flex-wrap gap-2">{options.map((option) => <button type="button" key={option} onClick={() => setVariant(option)} className={`border px-3 py-2 text-sm ${variant === option ? 'text-white' : 'border-[#d8d0c6] bg-white'}`} style={variant === option ? { background: color, borderColor: color } : undefined}>{option}</button>)}</div></div><div className="mt-6 flex items-center justify-between"><p className="text-xs font-semibold text-[#6b6156]">數量</p><div className="flex items-center border border-[#d8d0c6]"><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="h-9 w-9">−</button><span className="w-10 text-center text-sm">{quantity}</span><button type="button" onClick={() => setQuantity(quantity + 1)} className="h-9 w-9">＋</button></div></div><button type="button" disabled={unavailable} onClick={() => onAdd(product, variant, quantity)} className="mt-6 h-12 w-full font-semibold text-white disabled:bg-[#b8aaa0]" style={!unavailable ? { background: color } : undefined}>{unavailable ? '商品已售完' : '加入購物車'}</button></div></div></div></div>;
}
