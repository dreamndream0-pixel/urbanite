'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '@/lib/types';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';
const CART_KEY = 'cart';

type CartItem = {
  id: string;
  productId: string;
  name: string;
  variant: string;
  price: number;
  quantity: number;
};

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

export default function ProductDetailClient({ product }: { product: Product }) {
  const gallery = product.images?.length ? product.images : product.image ? [product.image] : [];
  const [activeImage, setActiveImage] = useState(gallery[0] ?? '');
  const [selectedColor, setSelectedColor] = useState(product.colors[0] ?? '');
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? '');
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<'description' | 'shipping'>('shipping');
  const [message, setMessage] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (settings?.logo_url) setLogoUrl(settings.logo_url);
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  const variantLabel = useMemo(
    () => [selectedColor, selectedSize].filter(Boolean).join(' / ') || '標準款',
    [selectedColor, selectedSize],
  );

  function addToCart(action: 'cart' | 'buy') {
    const id = `${product.id}-${selectedColor}-${selectedSize}`;
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: CartItem[] = raw ? JSON.parse(raw) : [];
      const existing = cart.find((it) => it.id === id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.push({
          id,
          productId: product.id,
          name: product.name,
          variant: variantLabel,
          price: product.price,
          quantity,
        });
      }
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* localStorage 不可用時略過 */
    }
    if (action === 'buy') {
      router.push('/checkout');
    } else {
      setMessage(`已加入購物車：${variantLabel} x ${quantity}`);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#2c2826]">
      <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
        <nav className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="回到選單" className="rounded-md p-1 text-[#1f1b19] hover:bg-[#efe8dd]">
              <IconMenu />
            </Link>
          </div>

          <Link href="/" className="justify-self-center px-2 text-center">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={STORE_NAME}
                className="mx-auto h-8 w-auto object-contain sm:h-10"
              />
            ) : settingsLoaded ? (
              <span className="font-serif text-2xl italic tracking-wide sm:text-3xl">
                {STORE_NAME}
              </span>
            ) : (
              <span className="inline-block h-8 sm:h-10" />
            )}
          </Link>

          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <Link href="/" aria-label="搜尋" className="rounded-md p-2 hover:bg-[#efe8dd]">
              <IconSearch />
            </Link>
            <Link href="/account" aria-label="我的帳號" className="rounded-md p-2 hover:bg-[#efe8dd]">
              <IconUser />
            </Link>
            <button aria-label="購物車" className="rounded-md p-2 hover:bg-[#efe8dd]">
              <IconBag />
            </button>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl">
        <div className="aspect-[16/10] overflow-hidden bg-[#eee8e1] sm:aspect-[16/8]">
          {activeImage ? (
            <img src={activeImage} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[#8a7f72]">無商品圖片</div>
          )}
        </div>
        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-5 py-3 sm:px-8">
            {gallery.map((url, index) => (
              <button
                key={`${url}-${index}`}
                onClick={() => setActiveImage(url)}
                aria-label={`查看圖片 ${index + 1}`}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition ${
                  activeImage === url ? 'border-[#c84767]' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-8 sm:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#c84767]">
            {product.category || 'Urbanite'}
          </p>
          <h1 className="max-w-3xl text-3xl font-medium leading-tight tracking-wide sm:text-4xl">
            {product.name}
          </h1>

          <div className="mt-8 border-l-4 border-[#c84767] pl-4 text-sm leading-7 text-[#3d3935]">
            <p>全店,超商滿1500免運費</p>
            <p>全店,宅配滿3000免運費</p>
          </div>

          <div className="mt-8 flex items-baseline gap-4">
            <span className="text-3xl font-bold text-[#c84767]">{formatter.format(product.price)}</span>
            {product.original_price ? (
              <span className="text-xl text-[#8a8480] line-through">
                {formatter.format(product.original_price)}
              </span>
            ) : null}
          </div>

          {product.colors.length > 0 && (
            <section className="mt-7">
              <p className="mb-2 text-sm text-[#8a8480]">顏色: {selectedColor}</p>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`min-w-16 border px-5 py-3 text-sm font-semibold ${
                      selectedColor === color
                        ? 'border-[#c84767] text-[#c84767]'
                        : 'border-[#e1d9d3] bg-[#f7f5f2] text-[#3d3935]'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </section>
          )}

          {product.sizes.length > 0 && (
            <section className="mt-6">
              <p className="mb-2 text-sm text-[#8a8480]">尺寸: {selectedSize}</p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`h-14 min-w-16 border text-sm font-semibold ${
                      selectedSize === size
                        ? 'border-2 border-[#c84767] bg-white text-[#2c2826]'
                        : 'border-[#ece7e2] bg-[#f7f5f2] text-[#3d3935]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <p className="mb-2 text-sm text-[#8a8480]">數量</p>
            <div className="grid h-12 grid-cols-[48px_1fr_48px] border border-[#d8d2cc]">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="text-2xl font-bold">
                -
              </button>
              <div className="flex items-center justify-center border-x border-[#d8d2cc]">{quantity}</div>
              <button onClick={() => setQuantity((q) => q + 1)} className="text-2xl font-bold">
                +
              </button>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => addToCart('cart')}
              className="bg-[#c84767] px-4 py-3 font-semibold text-white"
            >
              加入購物車
            </button>
            <button
              onClick={() => addToCart('buy')}
              className="bg-[#ff761a] px-4 py-3 font-semibold text-white"
            >
              ♧ 立即購買
            </button>
          </div>

          <button
            onClick={() => setFavorite((value) => !value)}
            className="mx-auto mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-[#5d5652]"
          >
            <IconStar filled={favorite} /> 收藏
          </button>

          {message && (
            <p className="mt-5 rounded-lg bg-[#f6f2ec] px-4 py-3 text-center text-sm font-semibold text-[#5d5652]">
              {message}
            </p>
          )}
        </div>

        <section className="border-t border-[#e5ded4] px-5 pb-16 sm:px-8">
          <div className="grid grid-cols-2 border-b border-[#e5ded4] text-center">
            <button
              onClick={() => setTab('description')}
              className={`py-4 ${tab === 'description' ? 'border-b-4 border-[#c84767] text-[#2c2826]' : 'text-[#8a8480]'}`}
            >
              商品描述
            </button>
            <button
              onClick={() => setTab('shipping')}
              className={`py-4 ${tab === 'shipping' ? 'border-b-4 border-[#c84767] text-[#2c2826]' : 'text-[#8a8480]'}`}
            >
              送貨及付款方式
            </button>
          </div>

          {tab === 'description' ? (
            <div className="mx-auto max-w-2xl py-10 text-center leading-8 text-[#5d5652]">
              <h2 className="text-2xl font-semibold text-[#2c2826]">商品描述</h2>
              <div className="mx-auto mt-4 h-1 w-10 bg-[#c84767]" />
              <p className="mt-8">{product.tagline || '精選商品,適合日常穿搭與送禮。'}</p>
              <p className="mt-3">庫存: {product.inventory}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl py-10 text-center leading-8 text-[#5d5652]">
              <h2 className="text-2xl font-semibold text-[#2c2826]">送貨及付款方式</h2>
              <div className="mx-auto mt-4 h-1 w-10 bg-[#c84767]" />
              <h3 className="mt-10 text-xl font-medium text-[#2c2826]">送貨方式</h3>
              <p className="mt-4">超商取貨、宅配到府。實際可用方式以結帳頁顯示為準。</p>
              <h3 className="mt-8 text-xl font-medium text-[#2c2826]">付款方式</h3>
              <p className="mt-4">目前可先建立訂單,正式金流串接完成後會顯示付款選項。</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}

function IconBag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 8h12l-1 12H7L6 8z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
    </svg>
  );
}

function IconStar({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? '#f5c542' : 'none'} stroke={filled ? '#d89a00' : 'currentColor'} strokeWidth="1.8" strokeLinejoin="round">
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1L12 2Z" />
    </svg>
  );
}
