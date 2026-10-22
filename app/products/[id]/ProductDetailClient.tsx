'use client';

import { useRouter } from 'next/navigation';
import { cleanRichText } from '@/lib/rich-text';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '@/lib/types';
import { productPrice } from '@/lib/product-price';
import { remainingStock, stockOf } from '@/lib/cart-stock';
import { initialSpecSelection, resolveSpecSelection, selectedSpecImage } from '@/lib/product-selection';
import ProductSpecPicker from '@/app/components/ProductSpecPicker';
import { resolvePromoNotices, type PromoNotice } from '@/lib/promo-notices';
import { freeShippingNotice } from '@/lib/shipping';
import StoreHeader from '@/app/components/StoreHeader';
import { useLoopCarousel } from '@/app/components/useLoopCarousel';
import { markStoreReturn, setShopHome } from '@/lib/shop-home';

const CART_KEY = 'cart';

type CartItem = {
  id: string;
  productId: string;
  name: string;
  variant: string;
  price: number;
  quantity: number;
};

// 商品頁價格顯示成「NT $1,234」
const ntd = (n: number) => `NT $${Math.round(Number(n) || 0).toLocaleString('en-US')}`;


export default function ProductDetailClient({ product: initialProduct, homeHref = '/', categoryName = '' }: { product: Product; homeHref?: string; categoryName?: string }) {
  const [liveProduct, setLiveProduct] = useState<Product | null>(null);
  const product = liveProduct?.id === initialProduct.id ? liveProduct : initialProduct;
  const gallery = product.images?.length ? product.images : product.image ? [product.image] : [];
  const specs = product.specs ?? [];
  // 促銷管理 → 活動管理的商品頁促銷文字
  const [promoNotices, setPromoNotices] = useState<PromoNotice[]>([]);
  const hasSpecs = specs.length > 0;
  // 商品照片可左右滑動(與首頁輪播圖相同的無限循環)
  const carousel = useLoopCarousel(gallery);
  // 選擇顏色時若該顏色圖不在相簿中,暫時顯示該圖;滑動或點縮圖後恢復相簿
  const [colorImage, setColorImage] = useState('');
  const activeImage = colorImage || gallery[carousel.realIndex] || '';
  const [selectedColor, setSelectedColor] = useState(product.colors[0] ?? '');
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? '');
  const [storedSpecSel, setSpecSel] = useState<string[]>(() => initialSpecSelection(product));
  const specSel = useMemo(() => resolveSpecSelection(product, storedSpecSel), [product, storedSpecSel]);
  const [requestedQuantity, setQuantity] = useState(1);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<'description' | 'shipping'>('description');
  // 畫面置中的提示(深灰 80% 半透明,3 秒後消失)
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }
  const [favorite, setFavorite] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  function refreshCartCount() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: CartItem[] = raw ? JSON.parse(raw) : [];
      setCartItems(cart);
      setCartCount(cart.reduce((n, it) => n + it.quantity, 0));
    } catch {
      setCartItems([]);
      setCartCount(0);
    }
  }

  useEffect(() => {
    setShopHome(homeHref);
  }, [homeHref]);

  useEffect(() => {
    Promise.resolve().then(refreshCartCount);
    let alive = true;
    let stockRequest = 0;
    const refresh = () => {
      const request = ++stockRequest;
      refreshCartCount();
      void fetch('/api/products?cart=1', { cache: 'no-store' })
        .then((res) => { if (!res.ok) throw new Error('Stock unavailable'); return res.json(); })
        .then((products: Product[]) => {
          if (!alive || request !== stockRequest) return;
          const current = products.find((entry) => entry.id === initialProduct.id);
          setLiveProduct(current ?? { ...initialProduct, status: '已下架', inventory: 0, variants: [] });
        }).catch(() => {});
    };
    const onStorage = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) refreshCartCount(); };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', onStorage);

    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('Settings unavailable'); return res.json(); })
      .then((settings) => {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid settings');
        if (settings?.logo_url) setLogoUrl(settings.logo_url);
        const shippingText = freeShippingNotice(settings);
        setPromoNotices(resolvePromoNotices(settings?.promo_notices)
          .filter((notice) => notice.id !== 'free-shipping' || Boolean(shippingText))
          .map((notice) => notice.id === 'free-shipping' ? { ...notice, text: shippingText } : notice));
      })
      .catch(() => {});

    // 表頭收藏數與本商品是否已收藏(未登入時為 0 / 未收藏)
    fetch('/api/favorites')
      .then((res) => (res.ok ? res.json() : { productIds: [] }))
      .then((data: { productIds?: string[] }) => {
        const ids = data.productIds ?? [];
        setFavoriteCount(ids.length);
        setFavorite(ids.includes(initialProduct.id));
      })
      .catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [initialProduct]);

  // 收藏/取消收藏,存在會員帳號(與首頁商品卡的愛心同一份清單)
  async function toggleFavorite() {
    if (favoritePending) return;
    const next = !favorite;
    setFavoritePending(true);
    setFavorite(next);
    try {
      const res = next
        ? await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id }),
          })
        : await fetch(`/api/favorites?productId=${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      if (res.status === 401) {
        setFavorite(!next);
        router.push(`/login?next=${encodeURIComponent(`/products/${product.id}`)}`);
        return;
      }
      if (!res.ok) throw new Error('favorite failed');
      setFavoriteCount((n) => Math.max(0, n + (next ? 1 : -1)));
      showToast(next ? '已加入收藏' : '已取消收藏');
    } catch {
      setFavorite(!next);
      showToast('收藏未儲存，請再試一次');
    } finally {
      setFavoritePending(false);
    }
  }

  const variantLabel = useMemo(() => {
    if (hasSpecs) return specSel.filter(Boolean).join(' / ') || '標準款';
    return [selectedColor, selectedSize].filter(Boolean).join(' / ') || '標準款';
  }, [hasSpecs, specSel, selectedColor, selectedSize]);
  const selectedPrice = productPrice(product, variantLabel);

  const allSpecsChosen = !hasSpecs || specSel.every(Boolean);
  const variantInventory = stockOf(product, variantLabel);
  const soldOut =
    /售完|完售|sold\s*out/i.test(product.status || '') ||
    (allSpecsChosen && variantInventory <= 0);
  const maxQty = allSpecsChosen ? remainingStock(product, variantLabel, cartItems) : 0;
  const quantity = Math.min(requestedQuantity, Math.max(1, maxQty));

  const cartIconRef = useRef<HTMLButtonElement>(null);
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

  function showImage(url: string) {
    const index = gallery.indexOf(url);
    if (index >= 0) {
      setColorImage('');
      carousel.go(index);
    } else {
      setColorImage(url);
    }
  }

  function showAdded() {
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 3000);
  }

  function addToCart(action: 'cart' | 'buy') {
    if (hasSpecs && !allSpecsChosen) {
      showToast('請先選擇完整規格');
      return;
    }
    if (soldOut) {
      showToast('此規格已售完');
      return;
    }
    const id = `${product.id}-${variantLabel}`;
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: CartItem[] = raw ? JSON.parse(raw) : [];
      const existing = cart.find((it) => it.id === id);
      const current = existing?.quantity ?? 0;
      const stock = stockOf(product, variantLabel);
      const capped = current + Math.min(quantity, remainingStock(product, variantLabel, cart));
      if (capped <= current) {
        refreshCartCount();
        showToast(`此商品（${variantLabel}）庫存僅剩 ${stock} 件,已達可加入上限。`);
        return;
      }
      if (capped < current + quantity) {
        showToast(`此商品（${variantLabel}）庫存僅剩 ${stock} 件,已為你調整數量。`);
      }
      if (existing) {
        existing.quantity = capped;
        existing.price = selectedPrice;
      } else {
        cart.push({
          id,
          productId: product.id,
          name: product.name,
          variant: variantLabel,
          price: selectedPrice,
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
    <main className="min-h-screen bg-[var(--c-surface)] text-[var(--c-text)]">
      <StoreHeader
        homeHref={homeHref}
        logoUrl={logoUrl}
        favoriteCount={favoriteCount}
        cartCount={cartCount}
        cartIconRef={cartIconRef}
        searchOpen={searchOpen}
        query={query}
        onMenu={() => { markStoreReturn(); router.push(homeHref, { scroll: false }); }}
        onHome={markStoreReturn}
        onSearchToggle={() => setSearchOpen((v) => !v)}
        onQueryChange={setQuery}
        onSearchSubmit={() => {
          const q = query.trim();
          router.push(q ? `${homeHref}?q=${encodeURIComponent(q)}` : homeHref);
        }}
        onFavorites={() => router.push('/account?tab=favorites')}
        onCart={() => router.push('/checkout')}
      />

      <section className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:py-8">
        <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:items-start">
        <div className="lg:sticky lg:top-24">
        <div
          className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-xl bg-[#eee8e1] sm:max-w-lg lg:max-w-none"
          // 開始滑動時收起顏色圖,回到相簿
          onPointerDownCapture={() => setColorImage('')}
        >
          {gallery.length ? (
            <div {...carousel.trackProps} className={`h-full select-none ${carousel.trackProps.className}`}>
              {carousel.slides.map((url, i) => (
                <img
                  key={`${url}-${i}`}
                  ref={!colorImage && i === carousel.pos ? mainImgRef : undefined}
                  data-product-spec-image={!colorImage && i === carousel.pos ? '' : undefined}
                  src={url}
                  alt={product.name}
                  draggable={false}
                  // 照片需接收觸控(事件冒泡到軌道才能滑動);關閉 iOS 長按圖片選單
                  className="h-full w-full shrink-0 select-none object-contain drop-shadow-[0_18px_22px_rgba(31,27,25,0.22)] [-webkit-touch-callout:none]"
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--c-muted)]">無商品圖片</div>
          )}
          {colorImage && (
            <img
              ref={mainImgRef}
              data-product-spec-image
              src={colorImage}
              alt={product.name}
              className="pointer-events-none absolute inset-0 h-full w-full bg-[#eee8e1] object-contain drop-shadow-[0_18px_22px_rgba(31,27,25,0.22)]"
            />
          )}
          {carousel.looping && (
            <>
              <button
                type="button"
                onClick={() => carousel.step(-1)}
                aria-label="上一張照片"
                className="absolute left-2 top-1/2 flex h-10 w-8 -translate-y-1/2 items-center justify-center text-[var(--c-text)]/30 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] transition hover:text-[var(--c-text)]"
              >
                <IconChevron dir="left" />
              </button>
              <button
                type="button"
                onClick={() => carousel.step(1)}
                aria-label="下一張照片"
                className="absolute right-2 top-1/2 flex h-10 w-8 -translate-y-1/2 items-center justify-center text-[var(--c-text)]/30 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] transition hover:text-[var(--c-text)]"
              >
                <IconChevron dir="right" />
              </button>
            </>
          )}
        </div>
        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-5 py-3 sm:px-8">
            {gallery.map((url, index) => (
              <button
                key={`${url}-${index}`}
                onClick={() => {
                  setColorImage('');
                  carousel.go(index);
                }}
                aria-label={`查看圖片 ${index + 1}`}
                className={`aspect-[4/5] w-12 shrink-0 overflow-hidden rounded-md border-2 bg-[#eee8e1] transition ${
                  !colorImage && carousel.realIndex === index ? 'border-[var(--c-sale)]' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={url} alt="" className="h-full w-full object-contain drop-shadow-[0_8px_10px_rgba(31,27,25,0.18)]" />
              </button>
            ))}
          </div>
        )}
        </div>

        <div className="px-1 pb-6 pt-1 sm:px-2 lg:py-0">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--c-sale)]">
            {categoryName || (product.category && !/^cp-/i.test(product.category) ? product.category : '')}
          </p>
          <h1 className="store-title max-w-3xl text-lg font-medium leading-[1.25] tracking-[0.015em] sm:text-[22px]">
            {product.name}
          </h1>
          {product.sale_mode && (
            <span className="mt-2 inline-block rounded-full bg-[var(--c-text2)]/40 px-2 py-0.5 text-[11px] font-medium text-white">
              {product.sale_mode}
            </span>
          )}

          <div className="mt-3 border-l-[3px] border-[var(--c-sale)] pl-2.5 text-xs leading-[1.6] text-[var(--c-text)]">
            {product.available_shipping_methods?.includes('免運') && <p>此商品免運費</p>}
            {promoNotices.filter((n) => n.active && !(product.available_shipping_methods?.includes('免運') && n.id === 'free-shipping')).map((n) => <p key={n.id}>{n.text}</p>)}
          </div>

          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="text-lg font-bold text-[var(--c-sale)]">{ntd(selectedPrice)}</span>
            {product.original_price && product.original_price > selectedPrice ? (
              <span className="text-sm text-[var(--c-muted)] line-through">
                {ntd(product.original_price)}
              </span>
            ) : null}
          </div>

          {hasSpecs ? (
            <>
              <ProductSpecPicker product={product} selected={specSel} onChange={(next, option) => {
                setSpecSel(next);
                const image = selectedSpecImage(product, next, option);
                if (image) showImage(image);
              }} />
              <p className="mt-2 text-xs">
                {!allSpecsChosen ? (
                  <span className="text-[var(--c-muted)]">請選擇完整規格</span>
                ) : soldOut ? (
                  <span className="font-semibold text-[#c0392b]">此規格已售完</span>
                ) : (
                  <span className="product-stock-count text-[var(--c-muted)]">庫存：{variantInventory} 件</span>
                )}
              </p>
            </>
          ) : (
            <>
              {product.colors.length > 0 && (
                <section className="mt-4">
                  <p className="mb-1.5 text-xs text-[var(--c-muted)]">顏色: {selectedColor}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {product.colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`min-w-10 bg-transparent px-3 py-[7px] text-xs! font-semibold ${
                          selectedColor === color
                            ? 'border border-[var(--c-sale)] text-[var(--c-sale)]'
                            : 'border-[0.5px] border-[var(--c-border-strong)] text-[var(--c-text)]'
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {product.sizes.length > 0 && (
                <section className="mt-4">
                  <p className="mb-1.5 text-xs text-[var(--c-muted)]">尺寸: {selectedSize}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {product.sizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`h-8 min-w-10 bg-transparent px-2 text-xs! font-semibold ${
                          selectedSize === size
                            ? 'border border-[var(--c-sale)] text-[var(--c-text)]'
                            : 'border-[0.5px] border-[var(--c-border-strong)] text-[var(--c-text)]'
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


          <section className="mt-4">
            <p className="mb-1.5 text-xs text-[var(--c-muted)]">數量</p>
            <div className="grid h-8 grid-cols-[32px_1fr_32px] border border-[var(--c-border)] text-sm">
              <button aria-label="減少數量" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="text-lg! font-bold disabled:opacity-30">
                -
              </button>
              <div data-product-quantity className="flex items-center justify-center border-x border-[var(--c-border)]">{quantity}</div>
              <button
                aria-label="增加數量"
                onClick={() => setQuantity(Math.min(quantity + 1, Math.max(1, maxQty)))}
                disabled={quantity >= maxQty}
                className="text-lg! font-bold disabled:cursor-not-allowed disabled:opacity-30"
              >
                +
              </button>
            </div>
            {allSpecsChosen && !soldOut && quantity >= maxQty ? <p role="status" className="mt-2 text-xs text-[#c0392b]">{maxQty === 0 ? '購物車已達此規格的庫存上限' : `最多還可加入 ${maxQty} 件（已扣除購物車數量）`}</p> : null}
          </section>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => addToCart('cart')}
              disabled={soldOut || !allSpecsChosen || maxQty <= 0}
              className="bg-[var(--c-cart-button)] px-3 py-2 text-sm! font-semibold text-white disabled:opacity-50"
            >
              {soldOut ? 'SOLD OUT' : '加入購物車'}
            </button>
            <button
              onClick={() => addToCart('buy')}
              disabled={soldOut || !allSpecsChosen || maxQty <= 0}
              className="bg-[var(--c-buy-button)] px-3 py-2 text-sm! font-semibold text-white disabled:opacity-50"
            >
              立即購買
            </button>
          </div>

          <button
            onClick={toggleFavorite}
            disabled={favoritePending}
            aria-pressed={favorite}
            className={`mx-auto mt-4 flex items-center justify-center gap-1.5 text-xs! font-semibold transition ${
              favorite ? 'text-[var(--c-sale)]' : 'text-[#5d5652]'
            }`}
          >
            <IconHeart filled={favorite} /> {favorite ? '已收藏' : '收藏'}
          </button>
        </div>
        </div>

        <section className="border-t border-[var(--c-border)] px-5 pb-16 sm:px-8 lg:mt-12">
          <div className="grid grid-cols-2 border-b border-[var(--c-border)] text-center">
            <button
              onClick={() => setTab('description')}
              className={`py-2.5 text-sm! ${tab === 'description' ? 'border-b-4 border-[var(--c-sale)] text-[var(--c-text)]' : 'text-[var(--c-muted)]'}`}
            >
              商品描述
            </button>
            <button
              onClick={() => setTab('shipping')}
              className={`py-2.5 text-sm! ${tab === 'shipping' ? 'border-b-4 border-[var(--c-sale)] text-[var(--c-text)]' : 'text-[var(--c-muted)]'}`}
            >
              送貨及付款方式
            </button>
          </div>

          {tab === 'description' ? (
            <div className="mx-auto max-w-2xl py-4 text-center text-[13px] leading-[1.6] text-[#5d5652]">
              {product.tagline ? (
                <div
                  className="mx-auto max-w-none text-left leading-[1.6] [&_a]:text-[var(--c-sale)] [&_img]:my-4 [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--c-border)] [&_td]:p-2 [&_th]:border [&_th]:border-[var(--c-border)] [&_th]:bg-[var(--c-bg)] [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6"
                  dangerouslySetInnerHTML={{ __html: cleanRichText(product.tagline) }}
                />
              ) : (
                <p>精選商品,適合日常穿搭與送禮。</p>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl py-4 text-center text-[13px] leading-[1.6] text-[#5d5652]">
              <h3 className="text-base font-medium text-[var(--c-text)]">送貨方式</h3>
              <p className="mt-4">
                超商取貨、宅配到府。
                <br />
                實際運送方式以結帳頁顯示為準。
              </p>
              <h3 className="mt-5 text-base font-medium text-[var(--c-text)]">付款方式</h3>
              <p className="mt-4">
                信用卡、電子支付、銀行轉帳。
                <br />
                實際付款方式以結帳頁顯示為準。
              </p>
              <h3 className="mt-5 text-base font-medium text-[var(--c-text)]">退換貨方式</h3>
              <p className="mt-4">請參考網站頁尾，退換貨政策說明資訊。</p>
            </div>
          )}
        </section>
      </section>

      {/* 置中懸浮提示(收藏等) */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed left-1/2 top-1/2 z-[80] w-max max-w-[85vw] -translate-x-1/2 -translate-y-1/2 rounded-xl leading-6 bg-[#333333]/80 px-6 py-4 text-center text-sm font-semibold text-white shadow-lg transition-opacity duration-300 ${
          toast ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {toast}
      </div>

      {/* 已加入購物車 提示(停約 3 秒後淡出) */}
      <div
        className={`pointer-events-none fixed right-4 top-20 z-[70] flex items-center gap-2 rounded-full bg-[var(--c-button)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-500 ${
          added ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        }`}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f7a44] text-white"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg></span>
        已加入購物車
      </div>
    </main>
  );
}

function IconHeart({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7.2-4.5-9.2-9.1C1.3 8.5 3.4 5 7 5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.7 3.5 4.2 6.9C19.2 16.5 12 21 12 21z" />
    </svg>
  );
}

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}
