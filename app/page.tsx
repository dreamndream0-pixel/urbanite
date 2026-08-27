'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/types';

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

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  // 載入商品
  useEffect(() => {
    fetch('/api/products')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Product[]) => {
        setProducts(data);
        const featured = data.find((p) => p.is_featured) ?? data[0];
        if (featured) {
          setColor(featured.colors[0] ?? '');
          setSize(featured.sizes[0] ?? '');
        }
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const liveProducts = products.filter((p) => p.status !== '已下架');
  const currentProduct = liveProducts.find((p) => p.is_featured) ?? liveProducts[0];
  const relatedProducts = liveProducts.filter((p) => p.id !== currentProduct?.id);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 2000 ? 0 : 120;
  const total = subtotal + shipping;

  function addMainProduct() {
    if (!currentProduct) return;
    const variant = [color, size].filter(Boolean).join(' / ') || '標準款';
    const id = `${currentProduct.id}-${color}-${size}`;
    setCart((items) => {
      const existing = items.find((item) => item.id === id);
      if (existing) {
        return items.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }
      return [
        ...items,
        {
          id,
          productId: currentProduct.id,
          name: currentProduct.name,
          variant,
          price: currentProduct.price,
          quantity,
        },
      ];
    });
    setCartOpen(true);
  }

  function addRelatedProduct(product: Product) {
    const id = `${product.id}-default`;
    setCart((items) => {
      const existing = items.find((item) => item.id === id);
      if (existing) {
        return items.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...items,
        {
          id,
          productId: product.id,
          name: product.name,
          variant: '標準款',
          price: product.price,
          quantity: 1,
        },
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

  return (
    <main className="min-h-screen bg-[#fff8f4] text-[#251b1f]">
      <header className="sticky top-0 z-30 border-b border-[#ead8d1] bg-[#fffaf7]/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link className="text-left" href="/" aria-label="回到商店首頁">
            <span className="block text-lg font-semibold tracking-[0.18em]">{STORE_NAME}</span>
            <span className="block text-xs text-[#80666b]">soft goods boutique</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-[#ead8d1] bg-white px-4 py-2 text-sm font-medium text-[#6c565b] hover:bg-[#f7ebe6]"
            >
              後台
            </Link>
            <button
              className="relative rounded-full bg-[#c84767] px-4 py-2 text-sm font-semibold text-white shadow-sm"
              onClick={() => setCartOpen(true)}
            >
              購物車
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs text-[#c84767]">
                {cartCount}
              </span>
            </button>
          </div>
        </nav>
      </header>

      {loading ? (
        <div className="mx-auto max-w-7xl px-4 py-24 text-center text-[#80666b]">商品載入中…</div>
      ) : !currentProduct ? (
        <div className="mx-auto max-w-7xl px-4 py-24 text-center text-[#80666b]">
          目前沒有上架商品。
        </div>
      ) : (
        <ShopView
          color={color}
          currentProduct={currentProduct}
          onAdd={addMainProduct}
          onAddRelated={addRelatedProduct}
          quantity={quantity}
          relatedProducts={relatedProducts}
          setColor={setColor}
          setQuantity={setQuantity}
          setSize={setSize}
          size={size}
        />
      )}

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

function ShopView({
  color,
  currentProduct,
  onAdd,
  onAddRelated,
  quantity,
  relatedProducts,
  setColor,
  setQuantity,
  setSize,
  size,
}: {
  color: string;
  currentProduct: Product;
  onAdd: () => void;
  onAddRelated: (product: Product) => void;
  quantity: number;
  relatedProducts: Product[];
  setColor: (color: string) => void;
  setQuantity: (quantity: number) => void;
  setSize: (size: string) => void;
  size: string;
}) {
  const gallery = [currentProduct.image, ...relatedProducts.map((item) => item.image)].filter(
    Boolean,
  );

  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:py-12">
        <div className="grid gap-3 sm:grid-cols-[96px_1fr]">
          <div className="order-2 grid grid-cols-3 gap-3 sm:order-1 sm:grid-cols-1">
            {gallery.map((image, index) => (
              <button
                key={image}
                className="aspect-square overflow-hidden rounded-lg border border-[#ead8d1] bg-white"
                aria-label={`商品圖片 ${index + 1}`}
              >
                <img className="h-full w-full object-cover" src={image} alt="" />
              </button>
            ))}
          </div>
          <div className="order-1 overflow-hidden rounded-[22px] bg-[#ead8d1] sm:order-2">
            <img
              className="h-full min-h-[440px] w-full object-cover"
              src={currentProduct.image}
              alt={`${currentProduct.name} 商品主圖`}
            />
          </div>
        </div>

        <article className="flex flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#c84767]">限定組合</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-6xl">{currentProduct.name}</h1>
          <p className="mt-4 text-lg leading-8 text-[#6c565b]">{currentProduct.tagline}</p>

          <div className="mt-5 flex items-end gap-3">
            <span className="text-3xl font-semibold">{formatter.format(currentProduct.price)}</span>
            {currentProduct.original_price ? (
              <span className="pb-1 text-lg text-[#9b8588] line-through">
                {formatter.format(currentProduct.original_price)}
              </span>
            ) : null}
          </div>

          <div className="mt-7 space-y-5">
            {currentProduct.colors.length > 0 && (
              <Picker label="顏色" options={currentProduct.colors} value={color} onChange={setColor} />
            )}
            {currentProduct.sizes.length > 0 && (
              <Picker label="尺寸" options={currentProduct.sizes} value={size} onChange={setSize} />
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">數量</p>
              <div className="inline-flex items-center rounded-full border border-[#d7b9b0] bg-white">
                <button className="px-4 py-3 text-xl" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  -
                </button>
                <span className="w-10 text-center font-semibold">{quantity}</span>
                <button className="px-4 py-3 text-xl" onClick={() => setQuantity(quantity + 1)}>
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            className="mt-7 rounded-full bg-[#251b1f] px-7 py-4 text-base font-semibold text-white shadow-[0_16px_35px_rgba(37,27,31,0.18)] transition hover:bg-[#3d2a31]"
            onClick={onAdd}
          >
            加入購物車
          </button>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {['滿 NT$2,000 免運', '私密包裝出貨', '7 日客服協助'].map((item) => (
              <div key={item} className="rounded-lg border border-[#ead8d1] bg-white/70 px-4 py-3 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      {relatedProducts.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#c84767]">一起帶走</p>
              <h2 className="text-3xl font-semibold">推薦加購</h2>
            </div>
            <a className="text-sm font-semibold text-[#6c565b]" href="#checkout">
              查看結帳區
            </a>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {relatedProducts.map((product) => (
              <div key={product.id} className="grid overflow-hidden rounded-xl border border-[#ead8d1] bg-white sm:grid-cols-[180px_1fr]">
                <img className="h-56 w-full object-cover sm:h-full" src={product.image} alt={product.name} />
                <div className="flex flex-col justify-between p-5">
                  <div>
                    <p className="text-sm font-semibold text-[#c84767]">{product.status}</p>
                    <h3 className="mt-1 text-xl font-semibold">{product.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#6c565b]">{product.tagline}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-semibold">{formatter.format(product.price)}</span>
                    <button className="rounded-full bg-[#c84767] px-4 py-2 text-sm font-semibold text-white" onClick={() => onAddRelated(product)}>
                      加購
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            className={`min-w-16 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              value === option
                ? 'border-[#251b1f] bg-[#251b1f] text-white'
                : 'border-[#d7b9b0] bg-white text-[#5f4b50] hover:border-[#c84767]'
            }`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
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
      }
    } catch {
      setMessage({ type: 'err', text: '連線發生問題,請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[#ead8d1] bg-white shadow-2xl transition-transform duration-300 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-[#ead8d1] px-5 py-4">
        <h2 className="text-xl font-semibold">購物車</h2>
        <button className="rounded-full border border-[#ead8d1] px-3 py-1 text-sm" onClick={onClose}>
          關閉
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-5">
        {cart.length === 0 ? (
          <p className="rounded-lg bg-[#fff8f4] p-5 text-[#6c565b]">購物車目前是空的。</p>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="rounded-lg border border-[#ead8d1] p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{item.name}</h3>
                  <p className="mt-1 text-sm text-[#80666b]">{item.variant}</p>
                </div>
                <span className="font-semibold">{formatter.format(item.price * item.quantity)}</span>
              </div>
              <div className="mt-4 inline-flex items-center rounded-full border border-[#ead8d1]">
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

      <div id="checkout" className="border-t border-[#ead8d1] p-5">
        <div className="space-y-2 text-sm">
          <Row label="小計" value={formatter.format(subtotal)} />
          <Row label="運費" value={shipping === 0 ? '免運' : formatter.format(shipping)} />
          <Row label="總計" value={formatter.format(total)} strong />
        </div>
        <div className="mt-4 grid gap-3">
          <input
            className="rounded-lg border border-[#ead8d1] px-4 py-3"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="rounded-lg border border-[#ead8d1] px-4 py-3"
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
            className="rounded-full bg-[#251b1f] px-5 py-3 font-semibold text-white disabled:opacity-60"
            onClick={submitOrder}
            disabled={submitting}
          >
            {submitting ? '送出中…' : '送出訂單'}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'pt-2 text-lg font-semibold' : 'text-[#6c565b]'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
