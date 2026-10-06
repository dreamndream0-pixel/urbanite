'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Product, Category, SiteSettings, Banner, Campaign } from '@/lib/types';
import { uiAlert } from '@/lib/ui-dialog';
import { computeShipping } from '@/lib/shipping';
import { setShopHome } from '@/lib/shop-home';
import { campaignHomeHref } from '@/lib/campaign';
import FavoriteFoldButton from '@/app/components/FavoriteFoldButton';
import CategoryNavigation from '@/app/components/CategoryNavigation';
import { useLoopCarousel } from '@/app/components/useLoopCarousel';
import { isProductSoldOut, isVisibleInStore } from '@/lib/product-status';
import { HIDDEN_FOOTER_SECTION_TITLES } from '@/lib/checkout-line';
import StoreHeader from '@/app/components/StoreHeader';

// 購物車存在瀏覽器本機的 key(結帳頁會讀同一份)
const CART_KEY = 'cart';

// 依商品/規格計算目前可加入的庫存;預購商品不受限。
function stockOf(product: Product | undefined, variant: string): number {
  if (!product) return Number.POSITIVE_INFINITY;
  if ((product.sale_mode || '').includes('預購')) return Number.POSITIVE_INFINITY;
  const vs = product.variants ?? [];
  if (vs.length > 0) {
    const v = vs.find((vv) => vv.options.join(' / ') === variant);
    return Math.max(0, v?.inventory ?? 0);
  }
  return Math.max(0, product.inventory ?? 0);
}

type CartItem = {
  id: string;
  productId: string;
  name: string;
  variant: string;
  price: number;
  quantity: number;
};

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';
const FOOTER_SOCIAL_SECTION_TITLE = '__footer_social_buttons__';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

function plainText(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// 前台分類 tab 用的型別(虛擬的「全部」也用同一形狀)
type CategoryTab = { slug: string; name: string; en: string; image?: string; children?: CategoryTab[] };
const ALL_TAB: CategoryTab = { slug: 'all', name: '全部', en: 'ALL' };

function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

// 主站首頁與一頁式活動頁共用同一個商店畫面;傳入 campaign 時只顯示該活動的商品。
export default function Storefront({ campaign = null, preview = false }: { campaign?: Campaign | null; preview?: boolean }) {
  const router = useRouter();
  const homeHref = campaign ? campaignHomeHref(campaign.slug) : '/';
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  // 主站開啟頁面預設停在「精選商品」;活動頁預設顯示全部活動商品
  const [category, setCategory] = useState(campaign ? 'all' : 'spring');
  const [displayCount, setDisplayCount] = useState(12);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [confirmedFavorites, setConfirmedFavorites] = useState<Set<string>>(new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [favoritePending, setFavoritePending] = useState<Set<string>>(new Set());
  const [favoriteNotice, setFavoriteNotice] = useState('');
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  // 購物車一律先以空陣列渲染,掛載後再從 localStorage 載入,
  // 這樣伺服器與瀏覽器第一次渲染一致,避免 hydration 不匹配警告。
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [user, setUser] = useState<{ email: string; name: string; isAdmin: boolean } | null>(null);
  const [quickAdd, setQuickAdd] = useState<Product | null>(null);
  const cartIconRef = useRef<HTMLButtonElement>(null);
  const [cartToast, setCartToast] = useState(false);
  const cartToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favoriteNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function notifyAdded() {
    setCartToast(true);
    if (cartToastTimer.current) clearTimeout(cartToastTimer.current);
    cartToastTimer.current = setTimeout(() => setCartToast(false), 3000);
  }

  // 加入購物車特效:一張商品縮圖從來源位置飛向右上角購物車圖示
  function flyToCart(imgUrl: string, sourceRect: DOMRect | null) {
    if (typeof document === 'undefined') return;
    const target = cartIconRef.current?.getBoundingClientRect();
    if (!imgUrl || !sourceRect || !target) return;
    const el = document.createElement('img');
    el.src = imgUrl;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      `position:fixed;left:${sourceRect.left}px;top:${sourceRect.top}px;` +
      `width:${sourceRect.width}px;height:${sourceRect.height}px;object-fit:contain;` +
      `border-radius:14px;z-index:100;pointer-events:none;opacity:.95;` +
      `transition:left 1.1s cubic-bezier(.45,-0.15,.6,1),top 1.1s cubic-bezier(.45,-0.15,.6,1),width 1.1s ease,height 1.1s ease,opacity 1.1s ease;`;
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

  // 從商品頁搜尋過來(?q=):直接顯示搜尋結果
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (!q) return;
    Promise.resolve().then(() => {
      setQuery(q);
      setSearchOpen(true);
      setCategory('all');
    });
  }, []);

  // 記住目前所在的商店,購物車/結帳頁的「回商店」會帶回這裡
  useEffect(() => {
    setShopHome(homeHref);
  }, [homeHref]);

  useEffect(() => {
    fetch(campaign ? `/api/products?campaign=${encodeURIComponent(campaign.id)}` : '/api/products')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Product[]) => setProducts(data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));

    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Category[]) => setDbCategories(data))
      .catch(() => setDbCategories([]));

    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((s) => {
        if (s?.logo_url) setLogoUrl(s.logo_url);
        if (s) setSettings(s);
      })
      .catch(() => {});

    if (campaign) return; // 活動頁的輪播圖使用活動主視覺(見 heroBanners)
    fetch('/api/banners')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Banner[]) => setBanners(data))
      .catch(() => setBanners([]));
  }, [campaign]);

  // 掛載後才從 localStorage 載入購物車
  useEffect(() => {
    Promise.resolve().then(() => {
      setCart(readCart());
      setCartHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!cartHydrated) return; // 尚未載入前不要寫入,以免把已存的購物車覆蓋成空
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* localStorage 不可用時略過 */
    }
  }, [cart, cartHydrated]);

  // 收藏清單紀錄在帳號裡:登入後從後端讀取,未登入則清空。
  useEffect(() => {
    if (!user) {
      Promise.resolve().then(() => {
        setFavorites(new Set());
        setConfirmedFavorites(new Set());
        setFavoritePending(new Set());
        setFavoritesLoaded(true);
      });
      return;
    }
    setFavoritesLoaded(false);
    fetch('/api/favorites')
      .then((res) => (res.ok ? res.json() : { productIds: [] }))
      .then((data: { productIds?: string[] }) => {
        const next = new Set(data.productIds ?? []);
        setFavorites(next);
        setConfirmedFavorites(next);
      })
      .catch(() => {
        setFavorites(new Set());
        setConfirmedFavorites(new Set());
      })
      .finally(() => setFavoritesLoaded(true));
  }, [user]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const refresh = async () => {
      try {
        const res = await fetch('/api/me');
        const data = await res.json();
        setUser(
          data?.email
            ? { email: data.email, name: data.name ?? '', isAdmin: !!data.isAdmin }
            : null,
        );
      } catch {
        setUser(null);
      }
    };
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, []);

  const shownCats = dbCategories.filter((c) => c.sort_order >= 0);
  // 活動頁只列出有活動商品的分類(含其上層分類)
  const usedSlugs = new Set(products.map((p) => p.category));
  const visibleCats = campaign
    ? shownCats.filter((c) => usedSlugs.has(c.slug) || shownCats.some((child) => child.parent_id === c.id && usedSlugs.has(child.slug)))
    : shownCats;
  const childrenOf = (pid: string): CategoryTab[] =>
    visibleCats
      .filter((c) => c.parent_id === pid)
      .map((c) => ({ slug: c.slug, name: c.name, en: c.en || c.slug.toUpperCase() }));
  const categoryTabs: CategoryTab[] = [
    ALL_TAB,
    ...visibleCats
      .filter((c) => !c.parent_id)
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        en: c.en || c.slug.toUpperCase(),
        image: c.image || '',
        children: childrenOf(c.id),
      })),
  ];

  // 未上架、以及售完的純現貨商品(自動下架)不顯示;預購商品售完仍顯示
  const liveProducts = products.filter(isVisibleInStore);

  // 活動頁的輪播圖使用活動主視覺
  const heroBanners: Banner[] = campaign
    ? campaign.hero_image
      ? [{ id: campaign.id, image: campaign.hero_image, link: '', title: campaign.title || campaign.name, active: true, sort_order: 0 }]
      : []
    : banners.filter((b) => b.active);

  const visibleProducts = useMemo(() => {
    let list = liveProducts;
    if (category !== 'all') {
      const parent = visibleCats.find((c) => c.slug === category);
      const selectedSlugs = new Set([
        category,
        ...(parent ? visibleCats.filter((c) => c.parent_id === parent.id).map((c) => c.slug) : []),
      ]);
      list = list.filter((p) => selectedSlugs.has(p.category));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || plainText(p.tagline).toLowerCase().includes(q),
      );
    }
    return list;
  }, [liveProducts, category, query, visibleCats]);

  const shown = visibleProducts.slice(0, displayCount);
  const hasMore = displayCount < visibleProducts.length;

  // 切換分類/搜尋時,顯示數量重設回 12
  useEffect(() => {
    setDisplayCount(12);
  }, [category, query]);

  // 捲動到接近底部時,載入下一批 12 個(每次捲到底加一批,不會一次全載)
  useEffect(() => {
    if (!hasMore) return;
    function onScroll() {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 400;
      if (nearBottom) setDisplayCount((c) => c + 12);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hasMore]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = computeShipping(subtotal, cart, products);
  const total = subtotal + shipping;

  const activeCategory = categoryTabs.flatMap((c) => [c, ...(c.children ?? [])]).find((c) => c.slug === category) ?? ALL_TAB;

  // 購物車縮圖:購物車可能有另一個商店(主站/活動頁)的商品,不在本頁清單時另外查詢
  const [cartCatalog, setCartCatalog] = useState<Product[]>([]);
  const missingCartIds = cart.some((item) => !products.some((p) => p.id === item.productId) && !cartCatalog.some((p) => p.id === item.productId));
  useEffect(() => {
    if (!cartOpen || !missingCartIds) return;
    fetch('/api/products?cart=1')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Product[]) => setCartCatalog(data))
      .catch(() => {});
  }, [cartOpen, missingCartIds]);

  function cartImage(item: CartItem) {
    const product = products.find((p) => p.id === item.productId) ?? cartCatalog.find((p) => p.id === item.productId);
    if (!product) return '';
    // 有該顏色的專屬圖就用顏色圖
    const colorImage = item.variant.split(' / ').map((option) => product.color_images?.[option]).find(Boolean);
    return colorImage || product.image || product.images?.[0] || '';
  }

  function addToCart(
    product: Product,
    opts?: { variant?: string; quantity?: number; openCart?: boolean },
  ) {
    const quantity = opts?.quantity ?? 1;
    const variant =
      opts?.variant ??
      ([product.colors[0], product.sizes[0]].filter(Boolean).join(' / ') || '標準款');
    const id = `${product.id}-${variant}`;
    const stock = stockOf(product, variant);
    const current = cart.find((item) => item.id === id)?.quantity ?? 0;

    if (stock <= 0) {
      void uiAlert('此商品目前無庫存,暫時無法加入購物車。');
      return;
    }
    const desired = current + quantity;
    const capped = Math.min(desired, stock);
    if (capped <= current) {
      void uiAlert(`此商品（${variant}）庫存僅剩 ${stock} 件,購物車已達可加入上限。`);
      if (opts?.openCart !== false) setCartOpen(true);
      return;
    }
    if (capped < desired) {
      void uiAlert(`此商品（${variant}）庫存僅剩 ${stock} 件,已為你調整為最大可購數量。`);
    }
    setCart((items) => {
      const existing = items.find((item) => item.id === id);
      if (existing) {
        return items.map((item) => (item.id === id ? { ...item, quantity: capped } : item));
      }
      return [
        ...items,
        { id, productId: product.id, name: product.name, variant, price: product.price, quantity: capped },
      ];
    });
    notifyAdded();
    if (opts?.openCart !== false) setCartOpen(true);
  }

  function updateCart(id: string, change: number) {
    setCart((items) =>
      items
        .map((item) => {
          if (item.id !== id) return item;
          let next = item.quantity + change;
          if (change > 0) {
            const stock = stockOf(products.find((p) => p.id === item.productId), item.variant);
            next = Math.min(next, stock);
          }
          return { ...item, quantity: Math.max(0, next) };
        })
        .filter((item) => item.id !== id || item.quantity > 0),
    );
  }

  function showFavoriteNotice(message: string) {
    setFavoriteNotice(message);
    if (favoriteNoticeTimer.current) clearTimeout(favoriteNoticeTimer.current);
    favoriteNoticeTimer.current = setTimeout(() => setFavoriteNotice(''), 2200);
  }

  async function setFavoriteSaved(id: string, nextSaved: boolean) {
    if (!user) {
      const nextPath = typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
      router.push(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }
    if (!favoritesLoaded || favoritePending.has(id)) return;
    const confirmed = confirmedFavorites.has(id);
    if (confirmed === nextSaved) return;
    setFavoritePending((prev) => new Set(prev).add(id));
    setFavorites((prev) => {
      const next = new Set(prev);
      if (nextSaved) next.add(id);
      else next.delete(id);
      return next;
    });
    try {
      const res = nextSaved
        ? await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: id }),
          })
        : await fetch(`/api/favorites?productId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('favorite failed');
      setConfirmedFavorites((prev) => {
        const next = new Set(prev);
        if (nextSaved) next.add(id);
        else next.delete(id);
        return next;
      });
      showFavoriteNotice(nextSaved ? '已加入收藏' : '已取消收藏');
    } catch {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (confirmed) next.add(id);
        else next.delete(id);
        return next;
      });
      showFavoriteNotice(nextSaved ? '收藏未儲存，請再試一次' : '取消收藏失敗，請再試一次');
    } finally {
      setFavoritePending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)]">
      {preview && (
        <div className="bg-[#221f1d] px-4 py-2 text-center text-xs font-semibold tracking-widest text-white">草稿預覽模式</div>
      )}
      {/* 頂部導覽 */}
      <StoreHeader
        homeHref={homeHref}
        logoUrl={logoUrl}
        favoriteCount={confirmedFavorites.size}
        cartCount={cartCount}
        cartIconRef={cartIconRef}
        searchOpen={searchOpen}
        query={query}
        onMenu={() => setMenuOpen(true)}
        onSearchToggle={() => setSearchOpen((v) => !v)}
        onQueryChange={setQuery}
        onFavorites={() => setFavoritesOpen(true)}
        onCart={() => setCartOpen(true)}
      />

      <HeroCarousel banners={heroBanners} />
      <CategoryNavigation categories={categoryTabs} value={category} onSelect={setCategory} imageStyle={settings?.category_image_style ?? 'circle'} />

      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        {/* 商品格狀排列 */}
        <section className="mt-6">
          <div className="mb-5">
            <h1 className="store-title text-2xl font-semibold tracking-wide sm:text-3xl">
              {activeCategory.slug === 'all' ? '全部商品' : activeCategory.name}
            </h1>
          </div>
          {loading ? (
            <p className="py-20 text-center text-[var(--c-muted)]">商品載入中…</p>
          ) : visibleProducts.length === 0 ? (
            <p className="py-20 text-center text-[var(--c-muted)]">這個分類目前沒有商品。</p>
          ) : (
            <>
              <div className="store-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    favorited={favorites.has(product.id)}
                    favoritePending={favoritePending.has(product.id)}
                    favoritesLoaded={favoritesLoaded}
                    onFavoriteChange={(next) => setFavoriteSaved(product.id, next)}
                    onAdd={() => setQuickAdd(product)}
                  />
                ))}
              </div>
              {hasMore && (
                <p className="mt-5 text-center text-sm text-[var(--c-muted)]">下滑載入更多…</p>
              )}
            </>
          )}
        </section>
      </div>

      <Footer settings={settings} logoUrl={logoUrl} homeHref={homeHref} />

      {/* 左側分類選單 */}
      <SideMenu
        open={menuOpen}
        categories={categoryTabs}
        onClose={() => setMenuOpen(false)}
        current={category}
        onSelect={(key) => {
          setCategory(key);
          setMenuOpen(false);
        }}
      />

      {/* 購物車 */}
      <CartDrawer
        cart={cart}
        open={cartOpen}
        shipping={shipping}
        subtotal={subtotal}
        total={total}
        recommendations={liveProducts
          .filter((p) => !cart.some((c) => c.productId === p.id))
          .slice(0, 6)}
        onClose={() => setCartOpen(false)}
        onUpdate={updateCart}
        onAdd={(product) => addToCart(product, { openCart: false })}
        maxOf={(item) => stockOf(products.find((p) => p.id === item.productId), item.variant)}
        imageOf={cartImage}
        onCheckout={() => {
          setCartOpen(false);
          router.push('/checkout');
        }}
      />

      {/* 收藏清單 */}
      <FavoritesDrawer
        open={favoritesOpen}
        items={liveProducts.filter((p) => confirmedFavorites.has(p.id))}
        onClose={() => setFavoritesOpen(false)}
        onRemove={(id) => setFavoriteSaved(id, false)}
        onAdd={(product) => {
          addToCart(product);
          setFavoritesOpen(false);
        }}
      />

      {/* 快速加入購物車懸浮視窗 */}
      {quickAdd && (
        <QuickAddModal
          product={quickAdd}
          favorited={favorites.has(quickAdd.id)}
          favoritePending={favoritePending.has(quickAdd.id)}
          favoritesLoaded={favoritesLoaded}
          onFavoriteChange={(next) => setFavoriteSaved(quickAdd.id, next)}
          onClose={() => setQuickAdd(null)}
          onFly={flyToCart}
          onAdd={(variant, quantity, buyNow) => {
            // 商品卡加入購物車:只顯示飛入動畫與「已加入購物車」提示,不自動打開購物車清單
            addToCart(quickAdd, { variant, quantity, openCart: false });
            setQuickAdd(null);
            if (buyNow) router.push('/checkout');
          }}
        />
      )}

      {/* 已加入購物車 提示(停約 3 秒後淡出) */}
      <div
        className={`pointer-events-none fixed right-4 top-20 z-[70] flex items-center gap-2 rounded-full bg-[var(--c-button)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-500 ${
          cartToast ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        }`}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f7a44] text-white"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg></span>
        已加入購物車
      </div>
      <div
        aria-live="polite"
        className={`pointer-events-none fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[var(--c-button)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-300 ${
          favoriteNotice ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        {favoriteNotice}
      </div>
    </main>
  );
}

function FavoritesDrawer({
  open,
  items,
  onClose,
  onRemove,
  onAdd,
}: {
  open: boolean;
  items: Product[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onAdd: (product: Product) => void;
}) {
  return (
    <>
      <div
        className={`fixed inset-x-0 bottom-0 top-[72px] z-40 bg-black/30 transition-opacity duration-300 sm:top-[80px] ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed bottom-0 right-0 top-[72px] z-50 flex w-full max-w-md flex-col bg-[var(--c-surface)] shadow-2xl transition-transform duration-300 sm:top-[80px] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--c-sale)]">
            <IconHeart filled /> <span className="text-[var(--c-text)]">收藏清單</span>
          </h2>
          <button className="rounded-md p-1 hover:bg-[var(--c-soft)]" onClick={onClose} aria-label="關閉">
            <IconClose />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {items.length === 0 ? (
            <p className="rounded-lg bg-[var(--c-bg)] p-5 text-[var(--c-text2)]">
              還沒有收藏商品。點商品右上角的折角即可加入收藏。
            </p>
          ) : (
            items.map((product) => (
              <div key={product.id} className="flex gap-3 rounded-lg border border-[var(--c-border)] p-3">
                <Link
                  href={`/products/${encodeURIComponent(product.id)}`}
                  onClick={onClose}
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-[var(--c-border)]"
                >
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="h-full w-full object-contain drop-shadow-[0_10px_12px_rgba(31,27,25,0.2)]" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-[#a99]">
                      無圖片
                    </span>
                  )}
                </Link>
                <div className="flex flex-1 flex-col">
                  <Link
                    href={`/products/${encodeURIComponent(product.id)}`}
                    onClick={onClose}
                    className="text-sm font-semibold leading-5 hover:text-[var(--c-sale)]"
                  >
                    {product.name}
                  </Link>
                  <span className="mt-1 font-semibold">{formatter.format(product.price)}</span>
                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <button
                      onClick={() => onAdd(product)}
                      className="rounded-full bg-[var(--c-button)] px-3 py-1.5 text-xs font-semibold text-[var(--c-button-text)] hover:bg-[var(--c-button-hover)]"
                    >
                      加入購物車
                    </button>
                    <button
                      onClick={() => onRemove(product.id)}
                      className="text-xs text-[var(--c-muted)] hover:text-[#c0392b]"
                    >
                      移除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

function Footer({ settings, logoUrl, homeHref }: { settings: SiteSettings | null; logoUrl: string; homeHref: string }) {
  const copyrightStartYear = 2025;
  const copyrightEndYear = Math.max(copyrightStartYear, new Date().getFullYear());
  const aboutLinks = settings?.footer_about_links?.length ? settings.footer_about_links : ['優惠資訊 / Coupon', '商店介紹 / Introduction', '與我們合作 / Cooperation'];
  const serviceLinks = settings?.footer_service_links?.length ? settings.footer_service_links : ['加入會員享折扣 / VIP', '挑選尺寸 / About Size', '購物須知 / How To Buy', '退換貨政策 / After-sales Service', '使用者條款 / Terms', '隱私權政策 / Privacy'];
  const savedSections = (settings?.footer_sections ?? [])
    .map((section) => ({
      title: section.title.trim(),
      items: section.items.filter((item) => item.subtitle.trim()),
    }))
    .filter((section) => !HIDDEN_FOOTER_SECTION_TITLES.includes(section.title) && (section.title || section.items.length));
  const sections = savedSections.length
    ? savedSections
    : [
        { title: '關於我們 ABOUT US', items: aboutLinks.map((subtitle) => ({ subtitle, content: '', url: '' })) },
        { title: '顧客服務 SERVICE', items: serviceLinks.map((subtitle) => ({ subtitle, content: '', url: '' })) },
      ];
  const footerPolicyLinks = ['隱私權政策', '使用者條款'].map((label) => {
    const match = sections
      .flatMap((section) => section.items.map((item) => ({ sectionTitle: section.title, item })))
      .find(({ item }) => isPolicyItem(item.subtitle, label));
    return match ? { label, href: getFooterLinkHref(match.item, match.sectionTitle) } : null;
  }).filter(Boolean) as { label: string; href: string }[];
  const displaySections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !isPolicyItem(item.subtitle)),
    }))
    .filter((section) => section.title || section.items.length);
  const socialLinks = getFooterSocialLinks(settings);
  const followSection = {
    title: '尋找我們 FOLLOW US',
    items: [
      settings?.footer_service_hours ? `服務時間：${settings.footer_service_hours}` : '',
      settings?.footer_email ? `E-MAIL：${settings.footer_email}` : '',
      settings?.footer_instagram_url ? 'Instagram' : '',
      settings?.footer_line_url ? 'LINE 官方帳號' : '',
      settings?.footer_company_name ? `公司名稱：${settings.footer_company_name}` : '',
      settings?.footer_tax_id ? `統一編號：${settings.footer_tax_id}` : '',
    ]
      .filter(Boolean)
      .map((subtitle) => ({ subtitle, content: '', url: '' })),
  };
  const hasFollowSection = displaySections.some((section) => /尋找我們|追蹤我們|follow us/i.test(section.title));
  const mobileSections = [
    ...displaySections,
    ...(hasFollowSection ? [] : [followSection]),
    { title: '訂閱最新消息', items: [{ subtitle: '訂閱收到新品、優惠與穿搭靈感。', content: '', url: '' }] },
  ];

  return (
    <footer className="border-t border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]">
      <div className="mx-auto hidden max-w-[88rem] gap-12 px-8 py-11 lg:grid lg:grid-cols-[1fr_minmax(0,4.5fr)_1.35fr]">
        <section className="text-center lg:text-left">
          <Link href={homeHref} aria-label="回首頁" className="inline-flex">
            {logoUrl ? (
              <img src={logoUrl} alt={STORE_NAME} className="site-logo h-10 w-auto object-contain" />
            ) : (
              <span className="inline-block h-10 w-32" aria-hidden />
            )}
          </Link>
          <p className="mt-5 text-sm leading-7 text-[var(--c-text2)]">
            簡約、質感、日常。
            <br />
            打造屬於你的穿搭風格。
          </p>
          <div className="mt-5 flex justify-center gap-3 lg:justify-start">
            {socialLinks.map((link, index) => (
              <SocialLink key={`${link.label}-${index}`} href={link.url} label={link.label} image={link.image}>
                {link.fallback}
              </SocialLink>
            ))}
          </div>
        </section>

        <div className="grid min-w-0 grid-cols-4 gap-x-8 gap-y-8 text-left">
          {displaySections.map((section, index) => (
            <FooterGroup
              key={`${section.title}-${index}`}
              title={section.title || '未命名'}
              items={section.items}
            />
          ))}
          {!savedSections.length && (
            <section className="min-w-0">
              <h2 className="text-sm font-bold tracking-wide">尋找我們 FOLLOW US</h2>
              <div className="mt-4 space-y-2 text-sm leading-6 text-[var(--c-text2)]">
                {settings?.footer_service_hours && <p>服務時間：{settings.footer_service_hours}</p>}
                {settings?.footer_email && <p>信箱:{settings.footer_email}</p>}
                {settings?.footer_company_name && <p>公司名稱：{settings.footer_company_name}</p>}
                {settings?.footer_tax_id && <p>統一編號：{settings.footer_tax_id}</p>}
              </div>
            </section>
          )}
        </div>

        <section className="text-center lg:text-left">
          <h2 className="text-sm font-bold tracking-wide">訂閱最新消息</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--c-text2)]">
            訂閱收到新品、優惠與穿搭靈感。
          </p>
          <form className="mt-5 space-y-3">
            <input
              type="email"
              placeholder="輸入你的 Email"
              className="h-12 w-full border border-[#d8cdc1] bg-[var(--c-surface)] px-4 text-sm outline-none focus:border-[var(--c-text)]"
            />
            <button
              type="button"
              className="h-12 w-full bg-[var(--c-button)] text-sm font-semibold text-[var(--c-button-text)] transition hover:bg-[var(--c-button-hover)]"
            >
              訂閱
            </button>
          </form>
        </section>
      </div>
      <div className="mx-auto max-w-3xl px-8 py-10 lg:hidden">
        <div className="divide-y divide-[var(--c-border)] border-y border-[var(--c-border)]">
          {mobileSections.map((section, index) => (
            <MobileFooterGroup
              key={`${section.title}-${index}`}
              title={section.title || '未命名'}
              items={section.items}
            />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3 border-b border-[var(--c-border)] py-8 text-center text-xs font-semibold text-[var(--c-text2)]">
          <FooterFeature icon="shirt" label="質感選品" />
          <FooterFeature icon="box" label="快速出貨" />
          <FooterFeature icon="truck" label="安心購物" />
          <FooterFeature icon="service" label="貼心客服" />
        </div>
        <section className="border-b border-[var(--c-border)] py-8 text-center">
          <Link href={homeHref} aria-label="回首頁" className="inline-flex justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt={STORE_NAME} className="site-logo h-11 w-auto object-contain" />
            ) : (
              <span className="inline-block h-11 w-32" aria-hidden />
            )}
          </Link>
          <p className="mt-5 text-sm leading-7 text-[var(--c-text2)]">
            簡約 × 質感 × 日常
            <br />
            打造屬於你的穿搭風格。
          </p>
          <div className="mt-5 flex justify-center gap-4">
            {socialLinks.map((link, index) => (
              <SocialLink key={`${link.label}-${index}`} href={link.url} label={link.label} image={link.image}>
                {link.fallback}
              </SocialLink>
            ))}
          </div>
        </section>
      </div>
      <div className="border-t border-[var(--c-border)] px-6 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-[var(--c-text2)] sm:flex-row">
          <p>Copyright © {copyrightStartYear}-{copyrightEndYear} URBANITE-TW. All rights reserved.</p>
          <div className="flex gap-6">
            {footerPolicyLinks.map((link) => (
              <a key={link.label} href={link.href} className="hover:text-[var(--c-text)]">{link.label}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

type FooterLinkItem = { subtitle: string; content: string; url: string };

function isPolicyItem(subtitle: string, target?: string) {
  const isPrivacy = subtitle.includes('隱私權政策') || subtitle.toLowerCase().includes('privacy');
  const isTerms = subtitle.includes('使用者條款') || subtitle.includes('服務條款') || subtitle.toLowerCase().includes('terms');
  if (target === '隱私權政策') return isPrivacy;
  if (target === '使用者條款') return isTerms;
  return isPrivacy || isTerms;
}

function getFooterSocialLinks(settings: SiteSettings | null) {
  const saved = settings?.footer_social_links
    ?.filter((link) => link.label?.trim() || link.image?.trim() || link.url?.trim())
    .slice(0, 3)
    .map((link) => ({
      label: link.label.trim() || '社群連結',
      image: link.image.trim(),
      url: normalizeFooterHref(link.url),
      fallback: link.label.trim().slice(0, 4) || '@',
    }));
  if (saved?.some((link) => link.url)) return saved;
  const sectionSaved = settings?.footer_sections
    ?.find((section) => section.title === FOOTER_SOCIAL_SECTION_TITLE)
    ?.items.filter((item) => item.subtitle?.trim() || item.content?.trim() || item.url?.trim())
    .slice(0, 3)
    .map((item) => ({
      label: item.subtitle.trim() || '社群連結',
      image: item.content.trim(),
      url: normalizeFooterHref(item.url),
      fallback: item.subtitle.trim().slice(0, 4) || '@',
    }));
  if (sectionSaved?.some((link) => link.url)) return sectionSaved;
  const followItems = settings?.footer_sections?.find((section) => /尋找我們|追蹤我們|follow us/i.test(section.title))?.items ?? [];
  const instagram = findFooterContactLink(followItems, /instagram/i) || normalizeFooterHref(settings?.footer_instagram_url);
  const line = findFooterContactLink(followItems, /line/i) || normalizeFooterHref(settings?.footer_line_url);
  const contact = findFooterContactLink(followItems, /聯絡客服|contact/i);
  const email = normalizeFooterEmail(settings?.footer_email) || normalizeFooterEmail(findFooterContactText(followItems, /e-mail|email|信箱/i));
  return [
    { label: 'Instagram', image: '', url: instagram, fallback: '◎' },
    { label: 'LINE', image: '', url: line, fallback: 'LINE' },
    { label: 'Contact', image: '', url: contact || email, fallback: '@' },
  ];
}

function findFooterContactLink(items: FooterLinkItem[], pattern: RegExp) {
  const item = items.find((entry) => pattern.test(entry.subtitle) && normalizeFooterHref(entry.url));
  return item ? normalizeFooterHref(item.url) : '';
}

function findFooterContactText(items: FooterLinkItem[], pattern: RegExp) {
  return items.find((entry) => pattern.test(entry.subtitle))?.subtitle ?? '';
}

function normalizeFooterHref(value?: string) {
  const href = value?.trim() ?? '';
  if (!href) return '';
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href)) return href;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`;
  return '';
}

function normalizeFooterEmail(value?: string) {
  const text = value?.trim() ?? '';
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? `mailto:${match[0]}` : '';
}

function FooterGroup({ title, items }: { title: string; items: FooterLinkItem[] }) {
  return (
    <section className="min-w-0">
      <h2 className="text-sm font-bold leading-5 tracking-wide">{title}</h2>
      <nav className="mt-4 space-y-2 text-sm leading-6 text-[var(--c-text2)]">
        {items.map((item, index) => <FooterLink key={`${item.subtitle}-${index}`} item={item} sectionTitle={title} />)}
      </nav>
    </section>
  );
}

function MobileFooterGroup({ title, items }: { title: string; items: FooterLinkItem[] }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-sm font-bold tracking-wide [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-xl font-light leading-none transition group-open:rotate-180">⌄</span>
      </summary>
      <nav className="space-y-3 pb-5 text-sm leading-7 text-[var(--c-text2)]">
        {items.map((item, index) => (
          item.url || item.content ? (
            <FooterLink key={`${item.subtitle}-${index}`} item={item} sectionTitle={title} />
          ) : (
            <p key={`${item.subtitle}-${index}`}>{item.subtitle}</p>
          )
        ))}
      </nav>
    </details>
  );
}

function FooterFeature({ icon, label }: { icon: 'box' | 'shirt' | 'truck' | 'service'; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className="flex h-10 w-10 items-center justify-center text-[var(--c-text2)]">
        <FooterFeatureIcon icon={icon} />
      </span>
      <span>{label}</span>
    </div>
  );
}

function FooterFeatureIcon({ icon }: { icon: 'box' | 'shirt' | 'truck' | 'service' }) {
  if (icon === 'shirt') {
    return (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4z" />
      </svg>
    );
  }
  if (icon === 'truck') {
    return (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.7" />
        <circle cx="18" cy="18" r="1.7" />
      </svg>
    );
  }
  if (icon === 'service') {
    return (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M5 12a7 7 0 0 1 14 0v4a3 3 0 0 1-3 3h-2" />
        <path d="M5 12v4h3v-5H5zM19 12v4h-3v-5h3z" />
      </svg>
    );
  }
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 7l8-4 8 4-8 4-8-4zM4 7v10l8 4 8-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

function FooterLink({ item, sectionTitle }: { item: FooterLinkItem; sectionTitle: string }) {
  return <a href={getFooterLinkHref(item, sectionTitle)} className="block hover:text-[var(--c-text)] hover:underline">{item.subtitle}</a>;
}

function getFooterLinkHref(item: FooterLinkItem, sectionTitle: string) {
  return item.content
    ? `/footer/${encodeURIComponent(sectionTitle)}/${encodeURIComponent(item.subtitle)}`
    : item.url || '#';
}

function SocialLink({ href, label, image, children }: { href?: string; label: string; image?: string; children: ReactNode }) {
  const active = href && href.trim();
  const content = image ? <img src={image} alt="" className="h-full w-full rounded-full object-cover" /> : children;
  if (!active) {
    return (
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[#d8cdc1] text-xs font-bold text-[#b8aea3]">
        {content}
      </span>
    );
  }
  return (
    <a
      href={href}
      aria-label={label}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noreferrer' : undefined}
      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--c-button)] text-xs font-bold text-[var(--c-button-text)] transition hover:bg-[var(--c-button-hover)]"
    >
      {content}
    </a>
  );
}

function ProductCard({
  product,
  favorited,
  favoritePending,
  favoritesLoaded,
  onFavoriteChange,
  onAdd,
}: {
  product: Product;
  favorited: boolean;
  favoritePending: boolean;
  favoritesLoaded: boolean;
  onFavoriteChange: (next: boolean) => void;
  onAdd: () => void;
}) {
  const productHref = `/products/${encodeURIComponent(product.id)}`;
  const soldOut = isProductSoldOut(product);

  return (
    <div className="product-card group flex flex-col overflow-hidden rounded-lg bg-[var(--c-card)] p-3 shadow-sm hover:shadow-md">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[6px] bg-[var(--c-surface)]">
        <Link href={productHref} aria-label={`查看 ${product.name}`}>
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className={`h-full w-full object-contain drop-shadow-[0_14px_16px_rgba(31,27,25,0.22)] ${soldOut ? 'opacity-60' : ''}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-[#a99]">
              無圖片
            </div>
          )}
        </Link>
        {!soldOut && product.status !== '上架中' && (
          <span className="absolute left-2 top-2 rounded bg-[var(--c-button)] px-2 py-1 text-xs font-medium text-[var(--c-button-text)]">
            {product.status}
          </span>
        )}
        <FavoriteFoldButton
          productName={product.name}
          imageUrl={product.image}
          isSaved={favorited}
          isLoading={!favoritesLoaded}
          pending={favoritePending}
          onSavedChange={onFavoriteChange}
        />
      </div>
      <div className="mt-3 flex flex-1 flex-col px-1">
        <Link href={productHref} className="hover:text-[var(--c-sale)]">
          <h3 className="store-title line-clamp-1 text-sm font-semibold leading-5">{product.name}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-[var(--c-muted)]">{plainText(product.tagline)}</p>
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-wide">{formatter.format(product.price)}</span>
            {product.original_price ? (
              <span className="text-xs text-[var(--c-muted)] line-through">
                {formatter.format(product.original_price)}
              </span>
            ) : null}
          </div>
          {soldOut ? (
            <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-[#b5a9a0] px-3 text-center text-[10px] font-bold leading-[1.05] tracking-[0.08em] text-white">
              SOLD<br />OUT
            </span>
          ) : (
            <button
              onClick={onAdd}
              aria-label={`將 ${product.name} 加入購物車`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--c-button)] text-[var(--c-button-text)] transition hover:bg-[var(--c-button-hover)]"
            >
              <IconCart />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SideMenu({
  open,
  categories,
  onClose,
  current,
  onSelect,
}: {
  open: boolean;
  categories: CategoryTab[];
  onClose: () => void;
  current: string;
  onSelect: (key: string) => void;
}) {
  // 使用者手動開合的狀態;未操作過的分類依「是否正在瀏覽其子分類」決定
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  function toggle(slug: string, isOpen: boolean) {
    setExpanded((prev) => ({ ...prev, [slug]: !isOpen }));
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-xs flex-col bg-[var(--c-header)] shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <span className="text-sm font-semibold tracking-[0.2em] text-[var(--c-muted)]">MENU</span>
          <button onClick={onClose} aria-label="關閉選單" className="rounded-md p-1 hover:bg-[var(--c-soft)]">
            <IconClose />
          </button>
        </div>
        <nav className="flex-1 overflow-auto px-5 py-6">
          {categories.map((c) => {
            const hasChildren = Boolean(c.children?.length);
            // 子分類預設收合;目前所在的子分類其上層自動展開
            const isOpen = expanded[c.slug] ?? Boolean(c.children?.some((s) => s.slug === current));
            return (
              <div key={c.slug} className="border-b border-[var(--c-soft)]">
                <div className="flex items-center">
                  <button
                    onClick={() => onSelect(c.slug)}
                    className={`block min-w-0 flex-1 py-4 text-left transition ${
                      current === c.slug ? 'text-[var(--c-text)]' : 'text-[var(--c-text2)] hover:text-[var(--c-text)]'
                    }`}
                  >
                    <span className="block text-[11px] tracking-[0.2em] text-[var(--c-muted)]">{c.en}</span>
                    <span className="mt-0.5 block text-lg font-medium">{c.name}</span>
                  </button>
                  {hasChildren && (
                    <button
                      onClick={() => toggle(c.slug, isOpen)}
                      aria-label={`${isOpen ? '收合' : '展開'}${c.name}`}
                      aria-expanded={isOpen}
                      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--c-muted)] transition hover:bg-[var(--c-soft)] hover:text-[var(--c-text)]"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>
                {hasChildren && (
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-3 pl-4">
                        {c.children!.map((s) => (
                          <button
                            key={s.slug}
                            tabIndex={isOpen ? 0 : -1}
                            onClick={() => onSelect(s.slug)}
                            className={`block w-full py-2 text-left text-sm transition ${
                              current === s.slug ? 'font-semibold text-[var(--c-text)]' : 'text-[var(--c-muted)] hover:text-[var(--c-text)]'
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function CartDrawer({
  cart,
  open,
  shipping,
  subtotal,
  total,
  recommendations,
  onClose,
  onUpdate,
  onAdd,
  maxOf,
  imageOf,
  onCheckout,
}: {
  cart: CartItem[];
  open: boolean;
  shipping: number;
  subtotal: number;
  total: number;
  recommendations: Product[];
  onClose: () => void;
  onUpdate: (id: string, change: number) => void;
  onAdd: (product: Product) => void;
  maxOf: (item: CartItem) => number;
  imageOf: (item: CartItem) => string;
  onCheckout: () => void;
}) {
  return (
    <>
      <div
        className={`fixed inset-x-0 bottom-0 top-[72px] z-40 bg-black/30 transition-opacity duration-300 sm:top-[80px] ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed bottom-0 right-0 top-[72px] z-50 flex w-full max-w-md flex-col bg-[var(--c-surface)] shadow-2xl transition-transform duration-300 sm:top-[80px] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <h2 className="text-xl font-semibold">購物車</h2>
          <button className="rounded-md p-1 hover:bg-[var(--c-soft)]" onClick={onClose} aria-label="關閉">
            <IconClose />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {cart.length === 0 ? (
            <p className="rounded-lg bg-[var(--c-bg)] p-5 text-[var(--c-text2)]">購物車目前是空的。</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex gap-3 rounded-lg border border-[var(--c-border)] p-4">
                <Link
                  href={`/products/${encodeURIComponent(item.productId)}`}
                  onClick={onClose}
                  aria-label={`查看 ${item.name}`}
                  className="aspect-[4/5] w-16 shrink-0 self-start overflow-hidden rounded-md bg-[var(--c-bg)]"
                >
                  {imageOf(item) ? (
                    <img src={imageOf(item)} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </Link>
                <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="mt-1 text-sm text-[var(--c-muted)]">{item.variant}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-semibold">{formatter.format(item.price * item.quantity)}</span>
                    <button
                      onClick={() => onUpdate(item.id, -item.quantity)}
                      aria-label="移除"
                      className="text-xs text-[var(--c-muted)] hover:text-[#c0392b]"
                    >
                      移除
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-[var(--c-border)]">
                    <button className="px-3 py-1" onClick={() => onUpdate(item.id, -1)}>
                      -
                    </button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <button
                      className="px-3 py-1 disabled:cursor-not-allowed disabled:opacity-30"
                      onClick={() => onUpdate(item.id, 1)}
                      disabled={item.quantity >= maxOf(item)}
                    >
                      +
                    </button>
                  </div>
                  {Number.isFinite(maxOf(item)) && item.quantity >= maxOf(item) ? (
                    <span className="text-xs text-[#c0392b]">已達庫存上限（{maxOf(item)}）</span>
                  ) : null}
                </div>
                </div>
              </div>
            ))
          )}

          {/* 您可能喜歡 */}
          {recommendations.length > 0 && (
            <div className="pt-2">
              <h3 className="mb-3 text-sm font-semibold text-[var(--c-text2)]">您可能喜歡…</h3>
              <div className="space-y-3">
                {recommendations.map((product) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <Link
                      href={`/products/${encodeURIComponent(product.id)}`}
                      onClick={onClose}
                      className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[var(--c-border)]"
                    >
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="h-full w-full object-contain drop-shadow-[0_8px_10px_rgba(31,27,25,0.18)]" />
                      ) : null}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${encodeURIComponent(product.id)}`}
                        onClick={onClose}
                        className="line-clamp-1 text-sm font-medium hover:text-[var(--c-sale)]"
                      >
                        {product.name}
                      </Link>
                      <p className="text-sm font-semibold text-[var(--c-sale)]">
                        {formatter.format(product.price)}
                      </p>
                    </div>
                    <button
                      onClick={() => onAdd(product)}
                      className="shrink-0 rounded-full border border-[var(--c-text)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--c-button)] hover:text-white"
                    >
                      加入
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--c-border)] p-5">
          <div className="space-y-2 text-sm">
            <Row label="小計" value={formatter.format(subtotal)} />
            <div className="flex justify-between text-[var(--c-muted)]">
              <span>運費</span>
              <span className="text-sm">結帳時依配送方式計算</span>
            </div>
            <Row label="總計" value={formatter.format(subtotal)} strong />
          </div>
          <button
            className="mt-4 w-full rounded-full bg-[var(--c-sale)] px-5 py-3 font-semibold text-white disabled:opacity-50"
            onClick={onCheckout}
            disabled={cart.length === 0}
          >
            訂單結帳
          </button>
        </div>
      </aside>
    </>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'pt-2 text-lg font-semibold' : 'text-[var(--c-text2)]'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function HeroCarousel({ banners }: { banners: Banner[] }) {
  const { slides, realIndex, realOf, step, go, trackProps } = useLoopCarousel(banners, { autoplayMs: 4000 });
  const count = banners.length;
  if (count === 0) return null;

  return (
    <section aria-label="首頁輪播" className="group relative w-full select-none overflow-hidden bg-[var(--c-border)]">
      <div {...trackProps}>
        {slides.map((banner, i) => {
          // 副本與真實張共用同一個「真實序號」,換回真實張時樣式不會閃動
          const active = realOf(i) === realIndex;
          const img = (
            <img
              src={banner.image}
              alt={banner.title || '輪播圖'}
              draggable={false}
              // 固定框架,圖片放大縮小填滿整個輪播框(適配版面大小)
              className={`pointer-events-none h-full w-full object-cover object-center transition-[opacity,transform,filter] duration-700 ease-out ${
                active ? 'scale-100 opacity-100 blur-0' : 'scale-[1.035] opacity-75 blur-[1px]'
              }`}
            />
          );
          return (
            <div
              key={`${banner.id}-${i}`}
              className="relative aspect-[4/5] w-full shrink-0 bg-[var(--c-border)] sm:aspect-[16/7] lg:aspect-[16/5]"
            >
              {banner.link ? (
                <a href={banner.link} target="_blank" rel="noreferrer" className="block h-full w-full">
                  {img}
                </a>
              ) : (
                img
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => step(-1)}
            aria-label="上一張"
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white opacity-0 transition group-hover:opacity-100 sm:flex"
          >
            <IconChevron dir="left" />
          </button>
          <button
            onClick={() => step(1)}
            aria-label="下一張"
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white opacity-0 transition group-hover:opacity-100 sm:flex"
          >
            <IconChevron dir="right" />
          </button>
          <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                onClick={() => go(i)}
                aria-label={`第 ${i + 1} 張`}
                className={`h-2 rounded-full border border-white/80 transition-all ${
                  i === realIndex ? 'w-2 bg-[var(--c-surface)]' : 'w-2 bg-transparent hover:bg-[var(--c-surface)]/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QuickAddModal({
  product,
  favorited,
  favoritePending,
  favoritesLoaded,
  onFavoriteChange,
  onClose,
  onAdd,
  onFly,
}: {
  product: Product;
  favorited: boolean;
  favoritePending: boolean;
  favoritesLoaded: boolean;
  onFavoriteChange: (next: boolean) => void;
  onClose: () => void;
  onAdd: (variant: string, quantity: number, buyNow: boolean) => void;
  onFly?: (imgUrl: string, rect: DOMRect | null) => void;
}) {
  const specs = product.specs ?? [];
  const hasSpecs = specs.length > 0;
  const imgRef = useRef<HTMLImageElement>(null);
  const [color, setColor] = useState(product.colors[0] ?? '');
  const [size, setSize] = useState(product.sizes[0] ?? '');
  // 預設規格:第一組合沒貨時,自動改選「第一個還有庫存」的組合,
  // 避免商品明明還有貨,卻因為預設卡在售完組合而整個顯示已售完。
  const [specSel, setSpecSel] = useState<string[]>(() => {
    const first = specs.map((d) => d.options[0] ?? '');
    if (!specs.length || (product.sale_mode || '').includes('預購')) return first;
    const variants = product.variants ?? [];
    const firstVariant = variants.find((v) => v.options.join(' / ') === first.join(' / '));
    if ((firstVariant?.inventory ?? 0) > 0) return first;
    const inStock = variants.find((v) => (v.inventory ?? 0) > 0);
    return inStock ? [...inStock.options] : first;
  });
  const [quantity, setQuantity] = useState(1);

  const variantLabel = hasSpecs
    ? specSel.filter(Boolean).join(' / ') || '標準款'
    : [color, size].filter(Boolean).join(' / ') || '標準款';
  const allChosen = !hasSpecs || specSel.every(Boolean);
  const variant = hasSpecs
    ? (product.variants ?? []).find((v) => v.options.join(' / ') === specSel.join(' / '))
    : null;
  const inv = hasSpecs ? variant?.inventory ?? 0 : product.inventory;
  const preorder = (product.sale_mode || '').includes('預購');
  const soldOut = /售完|完售|sold\s*out/i.test(product.status || '') || (!preorder && allChosen && inv <= 0);
  const maxQty = preorder ? Number.POSITIVE_INFINITY : Math.max(0, hasSpecs ? (allChosen ? inv : 0) : product.inventory ?? 0);

  // 某規格選項在「其他維度目前選擇」下有沒有庫存;沒有就反白
  function optionAvailable(dimIndex: number, opt: string) {
    if (!hasSpecs) return true;
    const candidate = specSel.map((v, idx) => (idx === dimIndex ? opt : v));
    const key = candidate.join(' / ');
    const found = (product.variants ?? []).find((v) => v.options.join(' / ') === key);
    return (found?.inventory ?? 0) > 0;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-[var(--c-surface)] p-5 sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 hover:bg-[var(--c-soft)]">
            <IconClose />
          </button>
        </div>

        <div className="flex gap-4">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-lg bg-[var(--c-border)]">
            {product.image ? (
              <img ref={imgRef} src={product.image} alt={product.name} className="h-full w-full object-contain drop-shadow-[0_12px_14px_rgba(31,27,25,0.2)]" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[#a99]">無圖片</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6">{product.name}</h2>
            {product.tagline && (
              <p className="mt-1 line-clamp-2 text-sm text-[var(--c-muted)]">{plainText(product.tagline)}</p>
            )}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[var(--c-sale)]">{formatter.format(product.price)}</span>
              {product.original_price ? (
                <span className="text-sm text-[var(--c-muted)] line-through">
                  {formatter.format(product.original_price)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {hasSpecs ? (
          <>
            {specs.map((dim, i) => (
              <section key={dim.name} className="mt-4">
                <p className="mb-2 text-sm text-[var(--c-muted)]">
                  {dim.name}：{specSel[i] || '請選擇'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {dim.options.map((opt) => {
                    const selected = specSel[i] === opt;
                    const available = optionAvailable(i, opt);
                    const grayed = selected ? soldOut : !available;
                    return (
                      <button
                        key={opt}
                        disabled={!selected && !available}
                        onClick={() => setSpecSel((prev) => prev.map((v, idx) => (idx === i ? opt : v)))}
                        className={`min-w-14 border px-4 py-2 text-sm font-semibold ${
                          grayed
                            ? 'cursor-not-allowed border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] line-through opacity-30'
                            : selected
                              ? 'border-[var(--c-sale)] text-[var(--c-sale)]'
                              : 'border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]'
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
              {!allChosen ? (
                <span className="text-[var(--c-muted)]">請選擇完整規格</span>
              ) : soldOut ? (
                <span className="font-semibold text-[#c0392b]">此規格已售完</span>
              ) : (
                <span className="text-[var(--c-muted)]">庫存：{inv} 件</span>
              )}
            </p>
          </>
        ) : (
          <>
            {product.colors.length > 0 && (
              <section className="mt-5">
                <p className="mb-2 text-sm text-[var(--c-muted)]">顏色：{color}</p>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`min-w-14 border px-4 py-2 text-sm font-semibold ${
                        color === c ? 'border-[var(--c-sale)] text-[var(--c-sale)]' : 'border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {product.sizes.length > 0 && (
              <section className="mt-4">
                <p className="mb-2 text-sm text-[var(--c-muted)]">尺寸：{size}</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`h-11 min-w-14 border text-sm font-semibold ${
                        size === s ? 'border-2 border-[var(--c-sale)] bg-[var(--c-surface)] text-[var(--c-text)]' : 'border-[#ece7e2] bg-[var(--c-bg)] text-[var(--c-text)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <section className="mt-4">
          <p className="mb-2 text-sm text-[var(--c-muted)]">數量</p>
          <div className="grid h-11 w-36 grid-cols-[40px_1fr_40px] border border-[var(--c-border)]">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="text-xl font-bold">
              -
            </button>
            <div className="flex items-center justify-center border-x border-[var(--c-border)]">{quantity}</div>
            <button
              onClick={() => setQuantity((q) => Math.min(q + 1, Math.max(1, maxQty)))}
              disabled={quantity >= maxQty}
              className="text-xl font-bold disabled:cursor-not-allowed disabled:opacity-30"
            >
              +
            </button>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => { onFly?.(product.image, imgRef.current?.getBoundingClientRect() ?? null); onAdd(variantLabel, quantity, false); }}
            disabled={!allChosen || soldOut}
            className="rounded-full bg-[var(--c-sale)] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {soldOut ? 'SOLD OUT' : '加入購物車'}
          </button>
          <button
            onClick={() => onAdd(variantLabel, quantity, true)}
            disabled={!allChosen || soldOut}
            className="rounded-full bg-[#ff761a] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            立即購買
          </button>
        </div>

        <button
          type="button"
          aria-pressed={favorited}
          aria-disabled={!favoritesLoaded || favoritePending}
          aria-busy={favoritePending}
          disabled={!favoritesLoaded || favoritePending}
          onClick={() => {
            if (favoritesLoaded && !favoritePending) onFavoriteChange(!favorited);
          }}
          className="mx-auto mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-[#5d5652] transition hover:bg-[var(--c-bg)] disabled:opacity-50"
        >
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-tr-lg ${favorited ? 'bg-[var(--c-brand)] text-white' : 'bg-[#F6F2EB] text-[#242321]'}`}>
            <IconHeart filled={favorited} />
          </span>
          {favorited ? '已收藏' : '加入收藏'}
        </button>
      </div>
    </div>
  );
}

/* ---------- 圖示 ---------- */
function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
function IconHeart({ filled = false, size = 16 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7.2-4.5-9.2-9.1C1.3 8.5 3.4 5 7 5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.7 3.5 4.2 6.9C19.2 16.5 12 21 12 21z" />
    </svg>
  );
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
