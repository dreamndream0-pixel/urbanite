'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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

    fetch('/api/settings', { cache: 'no-store' })
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
    ...dbCategories
      .filter((c) => c.sort_order >= 0)
      .map((c) => ({ slug: c.slug, name: c.name, en: c.en || c.slug.toUpperCase() })),
  ];

  const liveProducts = products.filter((p) => p.status !== '已下架');

  const visibleProducts = useMemo(() => {
    let list = liveProducts;
    if (category !== 'all') list = list.filter((p) => p.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || plainText(p.tagline).toLowerCase().includes(q),
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
    opts?: { variant?: string; quantity?: number; openCart?: boolean },
  ) {
    const quantity = opts?.quantity ?? 1;
    const variant =
      opts?.variant ??
      ([product.colors[0], product.sizes[0]].filter(Boolean).join(' / ') || '標準款');
    const id = `${product.id}-${variant}`;
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
      <header className="sticky top-0 z-30 bg-[#faf7f2]/95 backdrop-blur">
        <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6 sm:py-5">
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

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pt-8">
        {/* 首頁輪播圖 */}
        <HeroCarousel banners={banners.filter((b) => b.active)} />

        {/* 分類篩選列 */}
        <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max min-w-full items-center gap-3 whitespace-nowrap sm:justify-center">
            {categoryTabs.map((c) => (
              <button
                key={c.slug}
                onClick={() => setCategory(c.slug)}
                className={`shrink-0 rounded-full border px-5 py-3 text-sm font-semibold tracking-wide transition sm:px-7 ${
                  category === c.slug
                    ? 'border-[#1f1b19] bg-[#1f1b19] text-white shadow-sm'
                    : 'border-[#e0d7cc] bg-[#faf7f2] text-[#8a7f72] hover:border-[#cfc1b3] hover:text-[#1f1b19]'
                }`}
              >
                {c.slug === 'all' ? '全部商品' : c.name}
              </button>
            ))}
          </div>
        </div>

        {/* 商品格狀排列 */}
        <section className="mt-6 rounded-3xl border border-[#e5ded4] bg-[#faf7f2]/80 p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-wide sm:text-3xl">
              {activeCategory.slug === 'all' ? '本週精選' : activeCategory.name}
            </h1>
            <button
              type="button"
              onClick={() => setCategory('all')}
              className="shrink-0 text-sm font-semibold text-[#6b6156] hover:text-[#1f1b19]"
            >
              查看更多 ›
            </button>
          </div>
          {loading ? (
            <p className="py-20 text-center text-[#8a7f72]">商品載入中…</p>
          ) : visibleProducts.length === 0 ? (
            <p className="py-20 text-center text-[#8a7f72]">這個分類目前沒有商品。</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
      </div>

      <Footer settings={settings} logoUrl={logoUrl} />

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
          onAdd={(variant, quantity, buyNow) => {
            addToCart(quickAdd, { variant, quantity, openCart: !buyNow });
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

function Footer({ settings, logoUrl }: { settings: SiteSettings | null; logoUrl: string }) {
  const copyrightStartYear = 2025;
  const copyrightEndYear = Math.max(copyrightStartYear, new Date().getFullYear());
  const aboutLinks = settings?.footer_about_links?.length ? settings.footer_about_links : ['優惠資訊 / Coupon', '商店介紹 / Introduction', '與我們合作 / Cooperation'];
  const serviceLinks = settings?.footer_service_links?.length ? settings.footer_service_links : ['加入會員享折扣 / VIP', '挑選尺寸 / About Size', '購物須知 / How To Buy', '退換貨政策 / After-sales Service', '使用者條款 / Terms', '隱私權政策 / Privacy'];
  const savedSections = (settings?.footer_sections ?? [])
    .map((section) => ({
      title: section.title.trim(),
      items: section.items.filter((item) => item.subtitle.trim()),
    }))
    .filter((section) => section.title !== FOOTER_SOCIAL_SECTION_TITLE && (section.title || section.items.length));
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
    <footer className="border-t border-[#e5ded4] bg-[#f8f3ec] text-[#2c2826]">
      <div className="mx-auto hidden max-w-[88rem] gap-12 px-8 py-11 lg:grid lg:grid-cols-[1fr_minmax(0,4.5fr)_1.35fr]">
        <section className="text-center lg:text-left">
          <Link href="/" aria-label="回首頁" className="inline-flex">
            {logoUrl ? (
              <img src={logoUrl} alt={STORE_NAME} className="h-10 w-auto object-contain" />
            ) : (
              <span className="text-2xl font-black tracking-tight">urbanite</span>
            )}
          </Link>
          <p className="mt-5 text-sm leading-7 text-[#5f5852]">
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
              <div className="mt-4 space-y-2 text-sm leading-6 text-[#5f5852]">
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
          <p className="mt-4 text-sm leading-7 text-[#5f5852]">
            訂閱收到新品、優惠與穿搭靈感。
          </p>
          <form className="mt-5 space-y-3">
            <input
              type="email"
              placeholder="輸入你的 Email"
              className="h-12 w-full border border-[#d8cdc1] bg-white px-4 text-sm outline-none focus:border-[#1f1b19]"
            />
            <button
              type="button"
              className="h-12 w-full bg-[#1f1b19] text-sm font-semibold text-white transition hover:bg-[#3a322e]"
            >
              訂閱
            </button>
          </form>
        </section>
      </div>
      <div className="mx-auto max-w-3xl px-8 py-10 lg:hidden">
        <div className="divide-y divide-[#e1d8cd] border-y border-[#e1d8cd]">
          {mobileSections.map((section, index) => (
            <MobileFooterGroup
              key={`${section.title}-${index}`}
              title={section.title || '未命名'}
              items={section.items}
            />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3 border-b border-[#e1d8cd] py-8 text-center text-xs font-semibold text-[#5f5852]">
          <FooterFeature icon="shirt" label="質感選品" />
          <FooterFeature icon="box" label="快速出貨" />
          <FooterFeature icon="truck" label="安心購物" />
          <FooterFeature icon="service" label="貼心客服" />
        </div>
        <section className="border-b border-[#e1d8cd] py-8 text-center">
          <Link href="/" aria-label="回首頁" className="inline-flex justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt={STORE_NAME} className="h-11 w-auto object-contain" />
            ) : (
              <span className="text-3xl font-black tracking-tight">urbanite</span>
            )}
          </Link>
          <p className="mt-5 text-sm leading-7 text-[#5f5852]">
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
      <div className="border-t border-[#e5ded4] px-6 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-[#6f675f] sm:flex-row">
          <p>Copyright © {copyrightStartYear}-{copyrightEndYear} URBANITE-TW. All rights reserved.</p>
          <div className="flex gap-6">
            {footerPolicyLinks.map((link) => (
              <a key={link.label} href={link.href} className="hover:text-[#1f1b19]">{link.label}</a>
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
      <nav className="mt-4 space-y-2 text-sm leading-6 text-[#5f5852]">
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
      <nav className="space-y-3 pb-5 text-sm leading-7 text-[#5f5852]">
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
      <span className="flex h-10 w-10 items-center justify-center text-[#5f5852]">
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
  return <a href={getFooterLinkHref(item, sectionTitle)} className="block hover:text-[#1f1b19] hover:underline">{item.subtitle}</a>;
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
      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#1f1b19] text-xs font-bold text-white transition hover:bg-[#3a322e]"
    >
      {content}
    </a>
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
  const soldOut =
    (product.inventory ?? 0) <= 0 && !(product.sale_mode || '').includes('預購');
  const [flash, setFlash] = useState(false);

  function handleAdd() {
    if (soldOut) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1400);
      return;
    }
    onAdd();
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl bg-[#f6f2ec] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#e9e1d6]">
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
        {soldOut ? (
          <span className="absolute left-2 top-2 rounded bg-[#c0392b] px-2 py-1 text-xs font-medium text-white">
            已售完
          </span>
        ) : product.status !== '上架中' ? (
          <span className="absolute left-2 top-2 rounded bg-[#1f1b19] px-2 py-1 text-xs font-medium text-white">
            {product.status}
          </span>
        ) : null}
        <button
          onClick={onFavorite}
          aria-label="加入收藏"
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/65 shadow-sm backdrop-blur-sm transition hover:bg-white/85"
        >
          <IconStar filled={favorited} small />
        </button>
        {flash && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="animate-bounce rounded-full bg-[#1f1b19]/85 px-4 py-2 text-sm font-semibold text-white shadow-lg">
              已售完
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col px-1">
        <Link href={productHref} className="hover:text-[#c84767]">
          <h3 className="line-clamp-1 text-sm font-semibold leading-5">{product.name}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-[#8a7f72]">{plainText(product.tagline)}</p>
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-wide">{formatter.format(product.price)}</span>
            {product.original_price ? (
              <span className="text-xs text-[#b3a897] line-through">
                {formatter.format(product.original_price)}
              </span>
            ) : null}
          </div>
          <button
            onClick={handleAdd}
            aria-label={soldOut ? `${product.name} 已售完` : `將 ${product.name} 加入購物車`}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition ${
              soldOut ? 'bg-[#b5a9a0]' : 'bg-[#1f1b19] hover:bg-[#3a322e]'
            } ${flash ? 'scale-90' : ''}`}
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
                        <img src={product.image} alt={product.name} className="h-full w-full object-contain drop-shadow-[0_8px_10px_rgba(31,27,25,0.18)]" />
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
    <section className="group relative w-full select-none overflow-hidden rounded-3xl bg-[#e9e1d6] shadow-sm">
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
          <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                onClick={() => setIndex(i)}
                aria-label={`第 ${i + 1} 張`}
                className={`h-2 rounded-full border border-white/80 transition-all ${
                  i === index ? 'w-2 bg-white' : 'w-2 bg-transparent hover:bg-white/60'
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
  onAdd: (variant: string, quantity: number, buyNow: boolean) => void;
}) {
  const specs = product.specs ?? [];
  const hasSpecs = specs.length > 0;
  const [color, setColor] = useState(product.colors[0] ?? '');
  const [size, setSize] = useState(product.sizes[0] ?? '');
  const [specSel, setSpecSel] = useState<string[]>(() => specs.map((d) => d.options[0] ?? ''));
  const [quantity, setQuantity] = useState(1);

  const variantLabel = hasSpecs
    ? specSel.filter(Boolean).join(' / ') || '標準款'
    : [color, size].filter(Boolean).join(' / ') || '標準款';
  const allChosen = !hasSpecs || specSel.every(Boolean);
  const variant = hasSpecs
    ? (product.variants ?? []).find((v) => v.options.join(' / ') === specSel.join(' / '))
    : null;
  const inv = hasSpecs ? variant?.inventory ?? 0 : product.inventory;
  const soldOut = hasSpecs && allChosen && inv <= 0;

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
              <img src={product.image} alt={product.name} className="h-full w-full object-contain drop-shadow-[0_12px_14px_rgba(31,27,25,0.2)]" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[#a99]">無圖片</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6">{product.name}</h2>
            {product.tagline && (
              <p className="mt-1 line-clamp-2 text-sm text-[#8a7f72]">{plainText(product.tagline)}</p>
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

        {hasSpecs ? (
          <>
            {specs.map((dim, i) => (
              <section key={dim.name} className="mt-4">
                <p className="mb-2 text-sm text-[#8a8480]">
                  {dim.name}：{specSel[i] || '請選擇'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {dim.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSpecSel((prev) => prev.map((v, idx) => (idx === i ? opt : v)))}
                      className={`min-w-14 border px-4 py-2 text-sm font-semibold ${
                        specSel[i] === opt
                          ? 'border-[#c84767] text-[#c84767]'
                          : 'border-[#e1d9d3] bg-[#f7f5f2] text-[#3d3935]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <p className="mt-3 text-sm">
              {!allChosen ? (
                <span className="text-[#8a8480]">請選擇完整規格</span>
              ) : soldOut ? (
                <span className="font-semibold text-[#c0392b]">此規格已售完</span>
              ) : (
                <span className="text-[#8a8480]">庫存：{inv} 件</span>
              )}
            </p>
          </>
        ) : (
          <>
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
          </>
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
            onClick={() => onAdd(variantLabel, quantity, false)}
            disabled={!allChosen || soldOut}
            className="rounded-full bg-[#c84767] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {soldOut ? '已售完' : '加入購物車'}
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
