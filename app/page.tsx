'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Product, Category } from '@/lib/types';

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

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

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
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? { email: data.user.email ?? '' } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email ?? '' } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
  }

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

  function addToCart(product: Product) {
    const color = product.colors[0] ?? '';
    const size = product.sizes[0] ?? '';
    const variant = [color, size].filter(Boolean).join(' / ') || '標準款';
    const id = `${product.id}-${color}-${size}`;
    setCart((items) => {
      const existing = items.find((item) => item.id === id);
      if (existing) {
        return items.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...items,
        { id, productId: product.id, name: product.name, variant, price: product.price, quantity: 1 },
      ];
    });
    setCartOpen(true);
  }

  function updateCart(id: string, change: number) {
    setCart((items) =>
      items
        .map((item) => ({ ...item, quantity: Math.max(0, item.quantity + change) }))
        .filter((item) => item.id !== id || item.quantity > 0),
    );
  }

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      {/* 頂部導覽 */}
      <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
        <nav className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6">
          {/* 左:漢堡選單 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="開啟選單"
              className="rounded-md p-1 text-[#1f1b19] hover:bg-[#efe8dd]"
            >
              <IconMenu />
            </button>
          </div>

          {/* 中:Logo */}
          <Link href="/" className="justify-self-center px-2 text-center">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={STORE_NAME}
                className="mx-auto h-8 w-auto object-contain sm:h-10"
              />
            ) : (
              <span className="font-serif text-2xl italic tracking-wide sm:text-3xl">
                {STORE_NAME}
              </span>
            )}
          </Link>

          {/* 右:圖示列 */}
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="搜尋"
              className="rounded-md p-2 hover:bg-[#efe8dd]"
            >
              <IconSearch />
            </button>
            <button
              aria-label="收藏"
              className="hidden rounded-md p-2 hover:bg-[#efe8dd] sm:block"
            >
              <IconHeart filled={favorites.size > 0} />
            </button>
            <div className="relative">
              <button
                onClick={() => setAccountOpen((v) => !v)}
                aria-label="我的帳號"
                className="rounded-md p-2 hover:bg-[#efe8dd]"
              >
                <IconUser />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-[#e5ded4] bg-white p-2 shadow-lg">
                  {user ? (
                    <>
                      <p className="truncate px-3 py-2 text-xs text-[#8a7f72]">{user.email}</p>
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
                  ) : (
                    <button
                      onClick={signIn}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-[#f6f2ec]"
                    >
                      使用 Google 登入
                    </button>
                  )}
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

      {/* 標題 */}
      <section className="mx-auto max-w-7xl px-4 pb-4 pt-10 text-center sm:px-6 sm:pt-14">
        <p className="text-xs font-semibold tracking-[0.3em] text-[#8a7f72]">SHOP</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[0.15em] sm:text-5xl">
          {activeCategory.slug === 'all' ? '全部商品' : activeCategory.name}
        </h1>
      </section>

      {/* 分類篩選列 */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-b border-[#e5ded4] pb-4">
          {categoryTabs.map((c) => (
            <button
              key={c.slug}
              onClick={() => setCategory(c.slug)}
              className={`text-sm tracking-wide transition ${
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
                onAdd={() => addToCart(product)}
              />
            ))}
          </div>
        )}
      </section>

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
        onClose={() => setCartOpen(false)}
        onUpdate={updateCart}
        onClear={() => setCart([])}
      />
    </main>
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
  return (
    <div className="group flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[#e9e1d6]">
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
        {product.status !== '上架中' && (
          <span className="absolute left-2 top-2 rounded bg-[#1f1b19] px-2 py-1 text-xs font-medium text-white">
            {product.status}
          </span>
        )}
        <button
          onClick={onFavorite}
          aria-label="加入收藏"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm"
        >
          <IconHeart filled={favorited} small />
        </button>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="text-sm font-medium leading-5">{product.name}</h3>
        <p className="mt-1 line-clamp-1 text-xs text-[#8a7f72]">{product.tagline}</p>
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
            className="rounded-full bg-[#1f1b19] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#3a322e]"
          >
            加入
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
  onClose,
  onUpdate,
  onClear,
}: {
  cart: CartItem[];
  open: boolean;
  shipping: number;
  subtotal: number;
  total: number;
  onClose: () => void;
  onUpdate: (id: string, change: number) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [discountInput, setDiscountInput] = useState('');
  const [applied, setApplied] = useState<{ code: string; amount: number } | null>(null);
  const [discountMsg, setDiscountMsg] = useState('');

  const finalTotal = Math.max(0, total - (applied?.amount ?? 0));

  async function applyDiscount() {
    setDiscountMsg('');
    if (!discountInput.trim()) return;
    const res = await fetch('/api/discounts/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: discountInput, subtotal }),
    });
    const data = await res.json();
    if (res.ok) {
      setApplied({ code: data.code, amount: data.discount });
      setDiscountMsg(`已套用 ${data.code},折 ${formatter.format(data.discount)}`);
    } else {
      setApplied(null);
      setDiscountMsg(data.error ?? '折扣碼無效');
    }
  }

  async function submitOrder() {
    setMessage(null);
    if (cart.length === 0) {
      setMessage({ type: 'err', text: '購物車是空的' });
      return;
    }
    if (!name || !email) {
      setMessage({ type: 'err', text: '請填寫 Email 與收件人姓名' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name,
          email,
          discount_code: applied?.code ?? '',
          items: cart.map((item) => ({
            productId: item.productId,
            variant: item.variant,
            quantity: item.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error ?? '下單失敗,請稍後再試' });
      } else {
        setMessage({ type: 'ok', text: `訂單成立!單號 ${data.order_no}` });
        onClear();
        setName('');
        setEmail('');
        setApplied(null);
        setDiscountInput('');
        setDiscountMsg('');
      }
    } catch {
      setMessage({ type: 'err', text: '連線發生問題,請稍後再試' });
    } finally {
      setSubmitting(false);
    }
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
                  <span className="font-semibold">{formatter.format(item.price * item.quantity)}</span>
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
        </div>

        <div className="border-t border-[#e5ded4] p-5">
          <div className="mb-3 flex gap-2">
            <input
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder="折扣碼(選填)"
              className="flex-1 rounded-lg border border-[#e5ded4] px-4 py-2.5 text-sm"
            />
            <button
              onClick={applyDiscount}
              className="rounded-lg border border-[#1f1b19] px-4 py-2.5 text-sm font-semibold"
            >
              套用
            </button>
          </div>
          {discountMsg && (
            <p className={`mb-3 text-xs ${applied ? 'text-[#1f7a44]' : 'text-[#c0392b]'}`}>
              {discountMsg}
            </p>
          )}
          <div className="space-y-2 text-sm">
            <Row label="小計" value={formatter.format(subtotal)} />
            <Row label="運費" value={shipping === 0 ? '免運' : formatter.format(shipping)} />
            {applied && (
              <Row label={`折扣 ${applied.code}`} value={`-${formatter.format(applied.amount)}`} />
            )}
            <Row label="總計" value={formatter.format(finalTotal)} strong />
          </div>
          <div className="mt-4 grid gap-3">
            <input
              className="rounded-lg border border-[#e5ded4] px-4 py-3"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="rounded-lg border border-[#e5ded4] px-4 py-3"
              placeholder="收件人姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {message && (
              <p
                className={`rounded-lg px-4 py-2 text-sm ${
                  message.type === 'ok' ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdecec] text-[#c0392b]'
                }`}
              >
                {message.text}
              </p>
            )}
            <button
              className="rounded-full bg-[#1f1b19] px-5 py-3 font-semibold text-white disabled:opacity-60"
              onClick={submitOrder}
              disabled={submitting}
            >
              {submitting ? '送出中…' : '送出訂單'}
            </button>
          </div>
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
function IconHeart({ filled = false, small = false }: { filled?: boolean; small?: boolean }) {
  const s = small ? 16 : 20;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={filled ? '#c84767' : 'none'} stroke={filled ? '#c84767' : 'currentColor'} strokeWidth="1.6">
      <path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 7C19 16.65 12 21 12 21z" />
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
