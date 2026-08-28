'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Product, Category, SiteSettings, Banner } from '@/lib/types';

// 購物車存在瀏覽器本機的 key(結帳頁會讀同一份)
const CART_KEY = 'cart';

type CartItem = {
  id: string;
  productId: string;
  name: string;
  variant: string;
  price: number;
  quantity: number;
};

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

// 前台分類 tab 用的型別(虛擬的「全部」也用同一形狀)
type CategoryTab = { slug: string; name: string; en: string };
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

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  // 購物車一律先以空陣列渲染,掛載後再從 localStorage 載入,
  // 這樣伺服器與瀏覽器第一次渲染一致,避免 hydration 不匹配警告。
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [user, setUser] = useState<{ email: string; name: string; isAdmin: boolean } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<Product | null>(null);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Product[]) => setProducts(data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));

    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Category[]) => setDbCategories(data))
      .catch(() => setDbCategories([]));

    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((s) => {
        if (s?.logo_url) setLogoUrl(s.logo_url);
        if (s) setSettings(s);
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));

    fetch('/api/banners')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Banner[]) => setBanners(data))
      .catch(() => setBanners([]));
  }, []);

  // 掛載後才從 localStorage 載入購物車
  useEffect(() => {
    setCart(readCart());
    setCartHydrated(true);
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
      Promise.resolve().then(() => setFavorites(new Set()));
      return;
    }
    fetch('/api/favorites')
      .then((res) => (res.ok ? res.json() : { productIds: [] }))
      .then((data: { productIds?: string[] }) => setFavorites(new Set(data.productIds ?? [])))
      .catch(() => {});
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

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    setUser(null);
    setAccountOpen(false);
  }

  const categoryTabs: CategoryTab[] = [
    ALL_TAB,
    ...dbCategories.map((c) => ({ slug: c.slug, name: c.name, en: c.en || c.slug.toUpperCase() })),
  ];

  const liveProducts = products.filter((p) => p.status !== '已下架');

  const visibleProducts = useMemo(() => {
    let list = liveProducts;
    if (category !== 'all') list = list.filter((p) => p.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.tagline.toLowerCase().includes(q),
      );
    }
    return list;
  }, [liveProducts, category, query]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 2000 ? 0 : 120;
  const total = subtotal + shipping;

  const activeCategory = categoryTabs.find((c) => c.slug === category) ?? ALL_TAB;

  function addToCart(
    product: Product,
    opts?: { color?: string; size?: string; quantity?: number; openCart?: boolean },
  ) {
    const color = opts?.color ?? product.colors[0] ?? '';
    const size = opts?.size ?? product.sizes[0] ?? '';
    const quantity = opts?.quantity ?? 1;
    const variant = [color, size].filter(Boolean).join(' / ') || '標準款';
    const id = `${product.id}-${color}-${size}`;
    setCart((items) => {
      const existing = items.find((item) => item.id === id);
      if (existing) {
        return items.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }
      return [
        ...items,
        { id, productId: product.id, name: product.name, variant, price: product.price, quantity },
      ];
    });
    if (opts?.openCart !== false) setCartOpen(true);
  }

  function updateCart(id: string, change: number) {
    setCart((items) =>
      items
        .map((item) => ({ ...item, quantity: Math.max(0, item.quantity + change) }))
        .filter((item) => item.id !== id || item.quantity > 0),
    );
  }

  function toggleFavorite(id: string) {
    if (!user) {
      router.push('/login?next=/account');
      return;
    }
    const isFav = favorites.has(id);
    // 先樂觀更新畫面,再同步到後端
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(id);
      else next.add(id);
      return next;
    });
    if (isFav) {
      fetch(`/api/favorites?productId=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    } else {
      fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id }),
      }).catch(() => {});
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      {/* 頂部導覽 */}
      <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
        <nav className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6">
          {/* 左:漢堡選單 + 搜尋 */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="開啟選單"
              className="rounded-md p-1 text-[#1f1b19] hover:bg-[#efe8dd]"
            >
              <IconMenu />
            </button>
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="搜尋"
              className="rounded-md p-2 hover:bg-[#efe8dd]"
            >
              <IconSearch />
            </button>
          </div>

          {/* 中:Logo(載入完成前先留白,避免先閃文字再換成 Logo 圖)*/}
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

          {/* 右:圖示列 */}
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button
              onClick={() => setFavoritesOpen(true)}
              aria-label="收藏清單"
              className="relative rounded-md p-2 hover:bg-[#efe8dd]"
            >
              <IconStar filled={favorites.size > 0} />
              {favorites.size > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c84767] px-1 text-[10px] font-semibold text-white">
                  {favorites.size}
                </span>
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  if (!user) {
                    router.push('/login?next=/account');
                    return;
                  }
                  setAccountOpen((v) => !v);
                }}
                aria-label="我的帳號"
                className="rounded-md p-2 hover:bg-[#efe8dd]"
              >
                <IconUser />
              </button>
              {accountOpen && user && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-[#e5ded4] bg-white p-2 shadow-lg">
                  <>
                    <div className="px-3 py-2">
                      <p className="truncate text-xs text-[#8a7f72]">{user.email}</p>
                      {user.isAdmin && (
                        <span className="mt-1 inline-block rounded-full bg-[#1f1b19] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                          主管理員
                        </span>
                      )}
                    </div>
                    {user.isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setAccountOpen(false)}
                        className="mb-1 block rounded bg-[#f3ede4] px-3 py-2 text-sm font-semibold hover:bg-[#ece2d5]"
                      >
                        進入管理後台
                      </Link>
                    )}
                    <Link
                      href="/account"
                      onClick={() => setAccountOpen(false)}
                      className="block rounded px-3 py-2 text-sm hover:bg-[#f6f2ec]"
                    >
                      我的訂單
                    </Link>
                    <button
                      onClick={signOut}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-[#f6f2ec]"
                    >
                      登出
                    </button>
                  </>
                </div>
              )}
            </div>
            <button
              onClick={() => setCartOpen(true)}
              aria-label="購物車"
              className="relative rounded-md p-2 hover:bg-[#efe8dd]"
            >
              <IconBag />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c84767] px-1 text-[10px] font-semibold text-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </nav>

        {/* 搜尋列 */}
        {searchOpen && (
          <div className="border-t border-[#e5ded4] bg-[#faf7f2]">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋商品…"
                className="w-full rounded-full border border-[#e5ded4] bg-white px-5 py-2.5 text-sm outline-none focus:border-[#c9a] "
              />
            </div>
          </div>
        )}
      </header>

      {/* 首頁輪播圖 */}
      <HeroCarousel banners={banners.filter((b) => b.active)} />

      {/* 標題 */}
      <section className="mx-auto max-w-7xl px-4 pb-4 pt-10 text-center sm:px-6 sm:pt-14">
        <h1 className="text-4xl font-semibold tracking-[0.15em] sm:text-5xl">
          {activeCategory.slug === 'all' ? '全部商品' : activeCategory.name}
        </h1>
      </section>

      {/* 分類篩選列 */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="-mx-4 overflow-x-auto border-b border-[#e5ded4] px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex w-max min-w-full items-center gap-7 whitespace-nowrap sm:justify-center">
            {categoryTabs.map((c) => (
              <button
                key={c.slug}
                onClick={() => setCategory(c.slug)}
                className={`shrink-0 text-sm tracking-wide transition ${
                  category === c.slug
                    ? 'font-semibold text-[#1f1b19]'
                    : 'text-[#8a7f72] hover:text-[#1f1b19]'
                }`}
              >
                {c.en} <span className="ml-0.5">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 商品格狀排列 */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {loading ? (
          <p className="py-20 text-center text-[#8a7f72]">商品載入中…</p>
        ) : visibleProducts.length === 0 ? (
          <p className="py-20 text-center text-[#8a7f72]">這個分類目前沒有商品。</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                favorited={favorites.has(product.id)}
                onFavorite={() => toggleFavorite(product.id)}
                onAdd={() => setQuickAdd(product)}
              />
            ))}
          </div>
        )}
      </section>

      <Footer settings={settings} />

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
        onCheckout={() => {
          setCartOpen(false);
          router.push('/checkout');
        }}
      />

      {/* 收藏清單 */}
      <FavoritesDrawer
        open={favoritesOpen}
        items={liveProducts.filter((p) => favorites.has(p.id))}
        onClose={() => setFavoritesOpen(false)}
        onRemove={(id) => toggleFavorite(id)}
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
          onFavorite={() => toggleFavorite(quickAdd.id)}
          onClose={() => setQuickAdd(null)}
          onAdd={(color, size, quantity, buyNow) => {
            addToCart(quickAdd, { color, size, quantity, openCart: !buyNow });
            setQuickAdd(null);
            if (buyNow) router.push('/checkout');
          }}
        />
      )}
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
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#e5ded4] px-5 py-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <IconStar filled small /> 收藏清單
          </h2>
          <button className="rounded-md p-1 hover:bg-[#efe8dd]" onClick={onClose} aria-label="關閉">
            <IconClose />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {items.length === 0 ? (
            <p className="rounded-lg bg-[#f6f2ec] p-5 text-[#6b6156]">
              還沒有收藏商品。點商品右上角的星號即可加入收藏。
            </p>
          ) : (
            items.map((product) => (
              <div key={product.id} className="flex gap-3 rounded-lg border border-[#e5ded4] p-3">
                <Link
                  href={`/products/${encodeURIComponent(product.id)}`}
                  onClick={onClose}
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-[#e9e1d6]"
                >
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
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
                    className="text-sm font-semibold leading-5 hover:text-[#c84767]"
                  >
                    {product.name}
                  </Link>
                  <span className="mt-1 font-semibold">{formatter.format(product.price)}</span>
                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <button
                      onClick={() => onAdd(product)}
                      className="rounded-full bg-[#1f1b19] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3a322e]"
                    >
                      加入購物車
                    </button>
                    <button
                      onClick={() => onRemove(product.id)}
                      className="text-xs text-[#8a7f72] hover:text-[#c0392b]"
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

function Footer({ settings }: { settings: SiteSettings | null }) {
  const aboutLinks = settings?.footer_about_links?.length
    ? settings.footer_about_links
    : ['優惠資訊 / Coupon', '商店介紹 / Introduction', '與我們合作 / Cooperation'];
  const serviceLinks = settings?.footer_service_links?.length
    ? settings.footer_service_links
    : [
        '加入會員享折扣 / VIP',
        '挑選尺寸 / About Size',
        '購物須知 / How To Buy',
        '退換貨政策 / After-sales Service',
        '使用者條款 / Terms',
        '隱私權政策 / Privacy',
      ];

  return (
    <footer className="border-t border-[#e5ded4] bg-white px-8 py-12 text-[#2c2826] sm:px-10">
      <div className="mx-auto grid max-w-7xl gap-14 sm:grid-cols-3">
        <FooterGroup title="關於我們 ABOUT US" items={aboutLinks} />
        <FooterGroup title="顧客服務 SERVICE" items={serviceLinks} />
        <section>
          <h2 className="text-2xl font-bold tracking-wide">尋找我們 FOLLOW US</h2>
          <div className="mt-8 space-y-3 text-lg leading-7 text-[#494541]">
            {settings?.footer_service_hours && <p>服務時間：{settings.footer_service_hours}</p>}
            {settings?.footer_email && <p>信箱:{settings.footer_email}</p>}
            {settings?.footer_company_name && <p>公司名稱：{settings.footer_company_name}</p>}
            {settings?.footer_tax_id && <p>統一編號：{settings.footer_tax_id}</p>}
          </div>
          <div className="mt-5 flex gap-3">
            {settings?.footer_line_url && (
              <a
                href={settings.footer_line_url}
                className="flex h-12 w-12 items-center justify-center border border-[#e5ded4] text-sm font-semibold"
                target="_blank"
                rel="noreferrer"
              >
                LINE
              </a>
            )}
            {settings?.footer_instagram_url && (
              <a
                href={settings.footer_instagram_url}
                className="flex h-12 w-12 items-center justify-center border border-[#1f1b19] text-2xl font-semibold"
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
              >
                ◎
              </a>
            )}
          </div>
        </section>
      </div>
    </footer>
  );
}

function FooterGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="text-2xl font-bold tracking-wide">{title}</h2>
      <nav className="mt-8 space-y-4 text-lg leading-7 text-[#494541]">
        {items.map((item, index) => (
          <a key={`${item}-${index}`} href="#" className={index === 0 ? 'block text-[#b64b43]' : 'block'}>
            {item}
          </a>
        ))}
      </nav>
    </section>
  );
}

function ProductCard({
  product,
  favorited,
  onFavorite,
  onAdd,
}: {
  product: Product;
  favorited: boolean;
  onFavorite: () => void;
  onAdd: () => void;
}) {
  const productHref = `/products/${encodeURIComponent(product.id)}`;

  return (
    <div className="group flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[#e9e1d6]">
        <Link href={productHref} aria-label={`查看 ${product.name}`}>
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-[#a99]">
              無圖片
            </div>
          )}
        </Link>
        {product.status !== '上架中' && (
          <span className="absolute left-2 top-2 rounded bg-[#1f1b19] px-2 py-1 text-xs font-medium text-white">
            {product.status}
          </span>
        )}
        <button
          onClick={onFavorite}
          aria-label="加入收藏"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/50 shadow-sm backdrop-blur-sm transition hover:bg-white/70"
        >
          <IconStar filled={favorited} small />
        </button>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <Link href={productHref} className="hover:text-[#c84767]">
          <h3 className="text-sm font-medium leading-5">{product.name}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-[#8a7f72]">{product.tagline}</p>
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{formatter.format(product.price)}</span>
            {product.original_price ? (
              <span className="text-xs text-[#b3a897] line-through">
                {formatter.format(product.original_price)}
              </span>
            ) : null}
          </div>
          <button
            onClick={onAdd}
            aria-label={`將 ${product.name} 加入購物車`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f1b19] text-white transition hover:bg-[#3a322e]"
          >
            <IconCart />
          </button>
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
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-xs flex-col bg-[#faf7f2] shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#e5ded4] px-5 py-4">
          <span className="text-sm font-semibold tracking-[0.2em] text-[#8a7f72]">MENU</span>
          <button onClick={onClose} aria-label="關閉選單" className="rounded-md p-1 hover:bg-[#efe8dd]">
            <IconClose />
          </button>
        </div>
        <nav className="flex-1 overflow-auto px-5 py-6">
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => onSelect(c.slug)}
              className={`block w-full border-b border-[#efe8dd] py-4 text-left transition ${
                current === c.slug ? 'text-[#1f1b19]' : 'text-[#6b6156] hover:text-[#1f1b19]'
              }`}
            >
              <span className="block text-[11px] tracking-[0.2em] text-[#a99e8f]">{c.en}</span>
              <span className="mt-0.5 block text-lg font-medium">{c.name}</span>
            </button>
          ))}
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
  onCheckout: () => void;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#e5ded4] px-5 py-4">
          <h2 className="text-xl font-semibold">購物車</h2>
          <button className="rounded-md p-1 hover:bg-[#efe8dd]" onClick={onClose} aria-label="關閉">
            <IconClose />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {cart.length === 0 ? (
            <p className="rounded-lg bg-[#f6f2ec] p-5 text-[#6b6156]">購物車目前是空的。</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="rounded-lg border border-[#e5ded4] p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="mt-1 text-sm text-[#8a7f72]">{item.variant}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-semibold">{formatter.format(item.price * item.quantity)}</span>
                    <button
                      onClick={() => onUpdate(item.id, -item.quantity)}
                      aria-label="移除"
                      className="text-xs text-[#8a7f72] hover:text-[#c0392b]"
                    >
                      移除
                    </button>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center rounded-full border border-[#e5ded4]">
                  <button className="px-3 py-1" onClick={() => onUpdate(item.id, -1)}>
                    -
                  </button>
                  <span className="w-8 text-center text-sm">{item.quantity}</span>
                  <button className="px-3 py-1" onClick={() => onUpdate(item.id, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))
          )}

          {/* 您可能喜歡 */}
          {recommendations.length > 0 && (
            <div className="pt-2">
              <h3 className="mb-3 text-sm font-semibold text-[#6b6156]">您可能喜歡…</h3>
              <div className="space-y-3">
                {recommendations.map((product) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <Link
                      href={`/products/${encodeURIComponent(product.id)}`}
                      onClick={onClose}
                      className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[#e9e1d6]"
                    >
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                      ) : null}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${encodeURIComponent(product.id)}`}
                        onClick={onClose}
                        className="line-clamp-1 text-sm font-medium hover:text-[#c84767]"
                      >
                        {product.name}
                      </Link>
                      <p className="text-sm font-semibold text-[#c84767]">
                        {formatter.format(product.price)}
                      </p>
                    </div>
                    <button
                      onClick={() => onAdd(product)}
                      className="shrink-0 rounded-full border border-[#1f1b19] px-3 py-1.5 text-xs font-semibold hover:bg-[#1f1b19] hover:text-white"
                    >
                      加入
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[#e5ded4] p-5">
          <div className="space-y-2 text-sm">
            <Row label="小計" value={formatter.format(subtotal)} />
            <Row label="運費" value={shipping === 0 ? '免運' : formatter.format(shipping)} />
            <Row label="總計" value={formatter.format(total)} strong />
          </div>
          <button
            className="mt-4 w-full rounded-full bg-[#c84767] px-5 py-3 font-semibold text-white disabled:opacity-50"
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
    <div className={`flex justify-between ${strong ? 'pt-2 text-lg font-semibold' : 'text-[#6b6156]'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0); // 手指拖動中的即時位移(px)
  const [dragging, setDragging] = useState(false);
  const [widthPx, setWidthPx] = useState(0);
  const dragXRef = useRef(0);
  const startX = useRef<number | null>(null);
  const width = useRef(0);
  const count = banners.length;

  const go = (i: number) => setIndex((i + count) % count);

  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 4000);
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;
  const safeIndex = Math.min(index, count - 1);

  function onDown(clientX: number, currentTarget: HTMLElement) {
    startX.current = clientX;
    width.current = currentTarget.offsetWidth || 1;
    setWidthPx(width.current);
    setDragging(true);
    dragXRef.current = 0;
    setDragX(0);
  }
  function onMove(clientX: number) {
    if (startX.current === null) return;
    dragXRef.current = clientX - startX.current;
    setDragX(dragXRef.current);
  }
  function onUp() {
    if (startX.current === null) return;
    const d = dragXRef.current;
    const threshold = width.current * 0.15;
    if (d <= -threshold) setIndex((i) => (i + 1) % count);
    else if (d >= threshold) setIndex((i) => (i - 1 + count) % count);
    startX.current = null;
    dragXRef.current = 0;
    setDragging(false);
    setDragX(0);
  }

  const dragPercent = widthPx ? (dragX / widthPx) * 100 : 0;

  return (
    <section className="group relative w-full select-none overflow-hidden bg-[#e9e1d6]">
      <div
        className={`flex ${dragging ? '' : 'transition-transform duration-500 ease-out'}`}
        style={{ transform: `translateX(calc(-${safeIndex * 100}% + ${dragPercent}%))` }}
        onTouchStart={(e) => onDown(e.touches[0].clientX, e.currentTarget)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onUp}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') onDown(e.clientX, e.currentTarget);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' && startX.current !== null) onMove(e.clientX);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') onUp();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') onUp();
        }}
      >
        {banners.map((banner) => {
          const img = (
            <img
              src={banner.image}
              alt={banner.title || '輪播圖'}
              draggable={false}
              // 固定框架,圖片放大縮小填滿整個輪播框(適配版面大小)
              className="pointer-events-none h-full w-full object-cover"
            />
          );
          return (
            <div
              key={banner.id}
              className="relative aspect-[16/13] w-full shrink-0 bg-[#e9e1d6]"
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
            onClick={() => go(index - 1)}
            aria-label="上一張"
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white opacity-0 transition group-hover:opacity-100 sm:flex"
          >
            <IconChevron dir="left" />
          </button>
          <button
            onClick={() => go(index + 1)}
            aria-label="下一張"
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white opacity-0 transition group-hover:opacity-100 sm:flex"
          >
            <IconChevron dir="right" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                onClick={() => setIndex(i)}
                aria-label={`第 ${i + 1} 張`}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-5 bg-white' : 'w-2 bg-white/60 hover:bg-white/80'
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
  onFavorite,
  onClose,
  onAdd,
}: {
  product: Product;
  favorited: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onAdd: (color: string, size: string, quantity: number, buyNow: boolean) => void;
}) {
  const [color, setColor] = useState(product.colors[0] ?? '');
  const [size, setSize] = useState(product.sizes[0] ?? '');
  const [quantity, setQuantity] = useState(1);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 hover:bg-[#efe8dd]">
            <IconClose />
          </button>
        </div>

        <div className="flex gap-4">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-lg bg-[#e9e1d6]">
            {product.image ? (
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[#a99]">無圖片</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6">{product.name}</h2>
            {product.tagline && (
              <p className="mt-1 line-clamp-2 text-sm text-[#8a7f72]">{product.tagline}</p>
            )}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#c84767]">{formatter.format(product.price)}</span>
              {product.original_price ? (
                <span className="text-sm text-[#b3a897] line-through">
                  {formatter.format(product.original_price)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {product.colors.length > 0 && (
          <section className="mt-5">
            <p className="mb-2 text-sm text-[#8a8480]">顏色：{color}</p>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`min-w-14 border px-4 py-2 text-sm font-semibold ${
                    color === c ? 'border-[#c84767] text-[#c84767]' : 'border-[#e1d9d3] bg-[#f7f5f2] text-[#3d3935]'
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
            <p className="mb-2 text-sm text-[#8a8480]">尺寸：{size}</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`h-11 min-w-14 border text-sm font-semibold ${
                    size === s ? 'border-2 border-[#c84767] bg-white text-[#2c2826]' : 'border-[#ece7e2] bg-[#f7f5f2] text-[#3d3935]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-4">
          <p className="mb-2 text-sm text-[#8a8480]">數量</p>
          <div className="grid h-11 w-36 grid-cols-[40px_1fr_40px] border border-[#d8d2cc]">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="text-xl font-bold">
              -
            </button>
            <div className="flex items-center justify-center border-x border-[#d8d2cc]">{quantity}</div>
            <button onClick={() => setQuantity((q) => q + 1)} className="text-xl font-bold">
              +
            </button>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => onAdd(color, size, quantity, false)}
            className="rounded-full bg-[#c84767] px-4 py-3 font-semibold text-white"
          >
            加入購物車
          </button>
          <button
            onClick={() => onAdd(color, size, quantity, true)}
            className="rounded-full bg-[#ff761a] px-4 py-3 font-semibold text-white"
          >
            立即購買
          </button>
        </div>

        <button
          onClick={onFavorite}
          className="mx-auto mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-[#5d5652]"
        >
          <IconStar filled={favorited} small /> {favorited ? '已收藏' : '加入收藏'}
        </button>
      </div>
    </div>
  );
}

/* ---------- 圖示 ---------- */
function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
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
function IconStar({ filled = false, small = false }: { filled?: boolean; small?: boolean }) {
  const s = small ? 16 : 20;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={filled ? '#f5c542' : 'none'} stroke={filled ? '#d89a00' : 'currentColor'} strokeWidth="1.8" strokeLinejoin="round">
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1L12 2Z" />
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

function IconCart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
