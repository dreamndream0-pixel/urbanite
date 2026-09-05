'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '@/lib/types';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping';
import AccountMenu from '@/app/components/AccountMenu';

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
  const specs = product.specs ?? [];
  const hasSpecs = specs.length > 0;
  const [activeImage, setActiveImage] = useState(gallery[0] ?? '');
  const [selectedColor, setSelectedColor] = useState(product.colors[0] ?? '');
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? '');
  const [specSel, setSpecSel] = useState<string[]>(() => specs.map((d) => d.options[0] ?? ''));
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<'description' | 'shipping'>('shipping');
  const [message, setMessage] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const router = useRouter();

  function refreshCartCount() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: CartItem[] = raw ? JSON.parse(raw) : [];
      setCartCount(cart.reduce((n, it) => n + it.quantity, 0));
    } catch {
      setCartCount(0);
    }
  }

  useEffect(() => {
    Promise.resolve().then(refreshCartCount);

    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (settings?.logo_url) setLogoUrl(settings.logo_url);
      })
      .catch(() => {});
  }, []);

  const variantLabel = useMemo(() => {
    if (hasSpecs) return specSel.filter(Boolean).join(' / ') || '標準款';
    return [selectedColor, selectedSize].filter(Boolean).join(' / ') || '標準款';
  }, [hasSpecs, specSel, selectedColor, selectedSize]);

  // 依所選規格找到對應的庫存組合
  const selectedVariant = useMemo(() => {
    if (!hasSpecs) return null;
    const key = specSel.join(' / ');
    return (product.variants ?? []).find((v) => v.options.join(' / ') === key) ?? null;
  }, [hasSpecs, specSel, product.variants]);

  const allSpecsChosen = !hasSpecs || specSel.every(Boolean);
  const variantInventory = hasSpecs ? selectedVariant?.inventory ?? 0 : product.inventory;
  const soldOut = hasSpecs && allSpecsChosen && variantInventory <= 0;
  const preorder = (product.sale_mode || '').includes('預購');
  const maxQty = preorder
    ? Number.POSITIVE_INFINITY
    : Math.max(0, hasSpecs ? (allSpecsChosen ? variantInventory : 0) : product.inventory ?? 0);

  const cartIconRef = useRef<HTMLAnchorElement>(null);
  const mainImgRef = useRef<HTMLImageElement>(null);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flyToCart() {
    if (typeof document === 'undefined') return;
    const src = mainImgRef.current?.getBoundingClientRect();
    const target = cartIconRef.current?.getBoundingClientRect();
    if (!src || !target || !activeImage) return;
    const el = document.createElement('img');
    el.src = activeImage;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      `position:fixed;left:${src.left}px;top:${src.top}px;width:${Math.min(src.width, 160)}px;` +
      `height:${Math.min(src.height, 160)}px;object-fit:contain;border-radius:14px;z-index:100;` +
      `pointer-events:none;opacity:.95;transition:left 1.1s cubic-bezier(.45,-0.15,.6,1),top 1.1s cubic-bezier(.45,-0.15,.6,1),width 1.1s ease,height 1.1s ease,opacity 1.1s ease;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.left = `${target.left + target.width / 2 - 11}px`;
      el.style.top = `${target.top + target.height / 2 - 11}px`;
      el.style.width = '22px';
      el.style.height = '22px';
      el.style.opacity = '0.15';
    });
    window.setTimeout(() => el.remove(), 1160);
  }

  function showAdded() {
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 3000);
  }

  // 某規格選項在「其他維度目前的選擇」下是否有庫存;沒有就反白(不可選)
  function optionAvailable(dimIndex: number, opt: string) {
    if (!hasSpecs) return true;
    const candidate = specSel.map((v, idx) => (idx === dimIndex ? opt : v));
    const key = candidate.join(' / ');
    const variant = (product.variants ?? []).find((v) => v.options.join(' / ') === key);
    return (variant?.inventory ?? 0) > 0;
  }

  function addToCart(action: 'cart' | 'buy') {
    if (hasSpecs && !allSpecsChosen) {
      setMessage('請先選擇完整規格');
      return;
    }
    if (soldOut) {
      setMessage('此規格已售完');
      return;
    }
    const id = `${product.id}-${variantLabel}`;
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: CartItem[] = raw ? JSON.parse(raw) : [];
      const existing = cart.find((it) => it.id === id);
      const current = existing?.quantity ?? 0;
      const capped = Math.min(current + quantity, maxQty);
      if (capped <= current) {
        setMessage(`此商品（${variantLabel}）庫存僅剩 ${maxQty} 件,已達可加入上限。`);
        return;
      }
      if (capped < current + quantity) {
        setMessage(`此商品（${variantLabel}）庫存僅剩 ${maxQty} 件,已為你調整數量。`);
      }
      if (existing) {
        existing.quantity = capped;
      } else {
        cart.push({
          id,
          productId: product.id,
          name: product.name,
          variant: variantLabel,
          price: product.price,
          quantity: capped,
        });
      }
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* localStorage 不可用時略過 */
    }
    refreshCartCount();
    if (action === 'buy') {
      router.push('/checkout');
    } else {
      flyToCart();
      showAdded();
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
            ) : (
              <span className="inline-block h-8 w-28 sm:h-10 sm:w-36" aria-hidden />
            )}
          </Link>

          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <Link href="/" aria-label="搜尋" className="rounded-md p-2 hover:bg-[#efe8dd]">
              <IconSearch />
            </Link>
            <button
              type="button"
              onClick={() => setFavorite((value) => !value)}
              aria-label="收藏商品"
              className="rounded-md p-2 hover:bg-[#efe8dd]"
            >
              <IconStar filled={favorite} />
            </button>
            <Link ref={cartIconRef} href="/checkout" aria-label="購物車" className="relative rounded-md p-2 hover:bg-[#efe8dd]">
              <IconBag />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c84767] px-1 text-[10px] font-semibold text-white">
                  {cartCount}
                </span>
              )}
            </Link>
            <AccountMenu nextPath={`/products/${encodeURIComponent(product.id)}`} />
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:py-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
        <div className="mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-xl bg-[#eee8e1] sm:max-w-lg lg:max-w-none">
          {activeImage ? (
            <img ref={mainImgRef} src={activeImage} alt={product.name} className="h-full w-full object-contain drop-shadow-[0_18px_22px_rgba(31,27,25,0.22)]" />
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
                className={`aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-md border-2 bg-[#eee8e1] transition ${
                  activeImage === url ? 'border-[#c84767]' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={url} alt="" className="h-full w-full object-contain drop-shadow-[0_8px_10px_rgba(31,27,25,0.18)]" />
              </button>
            ))}
          </div>
        )}
        </div>

        <div className="px-1 py-6 sm:px-2 lg:py-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#c84767]">
            {product.category || 'Urbanite'}
          </p>
          <h1 className="max-w-3xl text-3xl font-medium leading-tight tracking-wide sm:text-4xl">
            {product.name}
          </h1>
          {product.sale_mode && (
            <span className="mt-3 inline-block rounded-full bg-[#6b6156]/40 px-3 py-1 text-xs font-medium text-white">
              {product.sale_mode}
            </span>
          )}

          <div className="mt-8 border-l-4 border-[#c84767] pl-4 text-sm leading-7 text-[#3d3935]">
            {product.available_shipping_methods?.includes('免運') ? (
              <p>此商品免運費</p>
            ) : (
              <p>全店消費滿 {formatter.format(FREE_SHIPPING_THRESHOLD)} 免運費</p>
            )}
          </div>

          <div className="mt-8 flex items-baseline gap-4">
            <span className="text-3xl font-bold text-[#c84767]">{formatter.format(product.price)}</span>
            {product.original_price ? (
              <span className="text-xl text-[#8a8480] line-through">
                {formatter.format(product.original_price)}
              </span>
            ) : null}
          </div>

          {hasSpecs ? (
            <>
              {specs.map((dim, i) => (
                <section key={dim.name} className="mt-6">
                  <p className="mb-2 text-sm text-[#8a8480]">
                    {dim.name}：{specSel[i] || '請選擇'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dim.options.map((opt) => {
                      const selected = specSel[i] === opt;
                      const available = optionAvailable(i, opt);
                      // 選中但整組售完也反白;非選中則看該搭配有沒有庫存
                      const grayed = selected ? soldOut : !available;
                      return (
                        <button
                          key={opt}
                          disabled={!selected && !available}
                          onClick={() => {
                            setSpecSel((prev) => prev.map((v, idx) => (idx === i ? opt : v)));
                            if (dim.name.includes('色') && product.color_images?.[opt]) {
                              setActiveImage(product.color_images[opt]);
                            }
                          }}
                          className={`min-w-16 border px-5 py-3 text-sm font-semibold ${
                            grayed
                              ? 'cursor-not-allowed border-[#e1d9d3] bg-[#f7f5f2] text-[#3d3935] line-through opacity-30'
                              : selected
                                ? 'border-[#c84767] text-[#c84767]'
                                : 'border-[#e1d9d3] bg-[#f7f5f2] text-[#3d3935]'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              <p className="mt-3 text-sm">
                {!allSpecsChosen ? (
                  <span className="text-[#8a8480]">請選擇完整規格</span>
                ) : soldOut ? (
                  <span className="font-semibold text-[#c0392b]">此規格已售完</span>
                ) : (
                  <span className="text-[#8a8480]">庫存：{variantInventory} 件</span>
                )}
              </p>
            </>
          ) : (
            <>
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
            </>
          )}

          {message && (
            <p className="mt-5 rounded-lg bg-[#f6f2ec] px-4 py-3 text-sm font-semibold text-[#5d5652]">
              {message}
            </p>
          )}

          <section className="mt-6">
            <p className="mb-2 text-sm text-[#8a8480]">數量</p>
            <div className="grid h-12 grid-cols-[48px_1fr_48px] border border-[#d8d2cc]">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="text-2xl font-bold">
                -
              </button>
              <div className="flex items-center justify-center border-x border-[#d8d2cc]">{quantity}</div>
              <button
                onClick={() => setQuantity((q) => Math.min(q + 1, Math.max(1, maxQty)))}
                disabled={quantity >= maxQty}
                className="text-2xl font-bold disabled:cursor-not-allowed disabled:opacity-30"
              >
                +
              </button>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => addToCart('cart')}
              disabled={soldOut}
              className="bg-[#c84767] px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {soldOut ? '已售完' : '加入購物車'}
            </button>
            <button
              onClick={() => addToCart('buy')}
              disabled={soldOut}
              className="bg-[#ff761a] px-4 py-3 font-semibold text-white disabled:opacity-50"
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
        </div>
        </div>

        <section className="border-t border-[#e5ded4] px-5 pb-16 sm:px-8 lg:mt-12">
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
              {product.tagline ? (
                <div
                  className="mx-auto mt-8 max-w-none text-left leading-8 [&_a]:text-[#c84767] [&_img]:my-4 [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#e5ded4] [&_td]:p-2 [&_th]:border [&_th]:border-[#e5ded4] [&_th]:bg-[#f6f2ec] [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6"
                  dangerouslySetInnerHTML={{ __html: product.tagline }}
                />
              ) : (
                <p className="mt-8">精選商品,適合日常穿搭與送禮。</p>
              )}
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

      {/* 已加入購物車 提示(停約 3 秒後淡出) */}
      <div
        className={`pointer-events-none fixed right-4 top-20 z-[70] flex items-center gap-2 rounded-full bg-[#1f1b19] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-500 ${
          added ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        }`}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f7a44] text-white"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg></span>
        已加入購物車
      </div>
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
