'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product, SiteSettings } from '@/lib/types';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';
const CART_KEY = 'cart';
const FREE_SHIPPING_THRESHOLD = 2000;
const SHIPPING_FEE = 120;

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

type CartItem = {
  id: string;
  productId: string;
  name: string;
  variant: string;
  price: number;
  quantity: number;
};

const SHIPPING_METHODS = ['全家 取貨付款', '7-11 取貨付款', '宅配到府'];
const PAYMENT_METHODS = ['取貨付款(貨到付款)', '轉帳匯款'];

function allowedForCart(
  allMethods: string[],
  products: Product[],
  cart: CartItem[],
  key: 'available_payment_methods' | 'available_shipping_methods',
) {
  if (cart.length === 0 || products.length === 0) return allMethods;
  const byId = new Map(products.map((product) => [product.id, product]));
  let allowed = new Set(allMethods);
  for (const item of cart) {
    const product = byId.get(item.productId);
    const productMethods = product?.[key] ?? [];
    const allowedForProduct = productMethods.length ? productMethods : allMethods;
    allowed = new Set([...allowed].filter((method) => allowedForProduct.includes(method)));
  }
  return [...allowed];
}

function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export default function CheckoutPage() {
  // 先以空購物車渲染,掛載後再從 localStorage 載入,避免 hydration 不匹配
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [shippingMethod, setShippingMethod] = useState(SHIPPING_METHODS[0]);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [discountInput, setDiscountInput] = useState('');
  const [applied, setApplied] = useState<{ code: string; amount: number } | null>(null);
  const [discountMsg, setDiscountMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [orderNo, setOrderNo] = useState('');

  useEffect(() => {
    setCart(readCart());
    setLoaded(true);

    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.email) setEmail(data.email);
        if (data?.name) setName(data.name);
      })
      .catch(() => {});

    fetch('/api/products')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Product[]) => setProducts(data))
      .catch(() => setProducts([]));

    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SiteSettings | null) => setSettings(data))
      .catch(() => setSettings(null));
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : subtotal > 0 ? SHIPPING_FEE : 0;
  const total = Math.max(0, subtotal + shipping - (applied?.amount ?? 0));
  const siteShippingMethods = settings?.shipping_methods?.length ? settings.shipping_methods : SHIPPING_METHODS;
  const sitePaymentMethods = settings?.payment_methods?.length ? settings.payment_methods : PAYMENT_METHODS;
  const availableShippingMethods = useMemo(
    () => allowedForCart(siteShippingMethods, products, cart, 'available_shipping_methods'),
    [siteShippingMethods, products, cart],
  );
  const availablePaymentMethods = useMemo(
    () => allowedForCart(sitePaymentMethods, products, cart, 'available_payment_methods'),
    [sitePaymentMethods, products, cart],
  );
  const selectedShippingMethod = availableShippingMethods.includes(shippingMethod)
    ? shippingMethod
    : availableShippingMethods[0] ?? '';
  const selectedPaymentMethod = availablePaymentMethods.includes(paymentMethod)
    ? paymentMethod
    : availablePaymentMethods[0] ?? '';

  function updateQty(id: string, change: number) {
    setCart((items) => {
      const next = items
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(0, item.quantity + change) } : item))
        .filter((item) => item.quantity > 0);
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {
        /* 略過 */
      }
      return next;
    });
  }

  async function applyDiscount() {
    setDiscountMsg('');
    if (!discountInput.trim()) return;
    try {
      const res = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountInput, subtotal }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplied({ code: data.code, amount: data.discount });
        setDiscountMsg(`已套用 ${data.code}，折 ${formatter.format(data.discount)}`);
      } else {
        setApplied(null);
        setDiscountMsg(data.error ?? '折扣碼無效');
      }
    } catch {
      setDiscountMsg('連線發生問題');
    }
  }

  async function submitOrder() {
    setMessage(null);
    if (cart.length === 0) {
      setMessage({ type: 'err', text: '購物車是空的' });
      return;
    }
    if (!name || !email) {
      setMessage({ type: 'err', text: '請填寫收件人姓名與 Email' });
      return;
    }
    if (!selectedShippingMethod || !selectedPaymentMethod) {
      setMessage({ type: 'err', text: '購物車內商品沒有共同可用的付款或送貨方式' });
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
          shipping_method: selectedShippingMethod,
          payment_method: selectedPaymentMethod,
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
        setMessage({ type: 'err', text: data.error ?? '下單失敗，請稍後再試' });
      } else {
        setOrderNo(data.order_no);
        setCart([]);
        try {
          localStorage.removeItem(CART_KEY);
        } catch {
          /* 略過 */
        }
      }
    } catch {
      setMessage({ type: 'err', text: '連線發生問題，請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm text-[#6b6156] hover:text-[#1f1b19]">
            ← 回商店
          </Link>
          <Link href="/" className="font-serif text-xl italic tracking-wide">
            {STORE_NAME}
          </Link>
          <span className="w-14" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-wide">訂單結帳</h1>

        {orderNo ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-[#1f7a44]">訂單成立！</p>
            <p className="mt-2 text-[#6b6156]">單號：{orderNo}</p>
            <p className="mt-1 text-sm text-[#8a7f72]">我們會盡快為你備貨，感謝購買。</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full bg-[#1f1b19] px-6 py-3 font-semibold text-white"
            >
              繼續購物
            </Link>
          </div>
        ) : !loaded ? (
          <p className="py-20 text-center text-[#8a7f72]">載入中…</p>
        ) : cart.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-[#6b6156]">購物車是空的。</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full bg-[#1f1b19] px-6 py-3 font-semibold text-white"
            >
              去逛逛
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 購買明細 */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold">購買明細（{cart.length} 件）</h2>
              <div className="space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#f0eae1] pb-4 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <h3 className="font-medium">{item.name}</h3>
                      <p className="text-sm text-[#8a7f72]">{item.variant}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center rounded-full border border-[#e5ded4]">
                        <button className="px-3 py-1" onClick={() => updateQty(item.id, -1)}>
                          -
                        </button>
                        <span className="w-8 text-center text-sm">{item.quantity}</span>
                        <button className="px-3 py-1" onClick={() => updateQty(item.id, 1)}>
                          +
                        </button>
                      </div>
                      <span className="w-20 text-right font-semibold">
                        {formatter.format(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 優惠券 */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">優惠券 / 優惠碼</h2>
              <div className="flex gap-2">
                <input
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  placeholder="輸入優惠代碼"
                  className="flex-1 rounded-lg border border-[#e5ded4] px-4 py-2.5 text-sm"
                />
                <button
                  onClick={applyDiscount}
                  className="rounded-lg border border-[#1f1b19] px-5 py-2.5 text-sm font-semibold"
                >
                  套用
                </button>
              </div>
              {discountMsg && (
                <p className={`mt-2 text-xs ${applied ? 'text-[#1f7a44]' : 'text-[#c0392b]'}`}>{discountMsg}</p>
              )}
            </section>

            {/* 付款與送貨方式 */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold">付款與送貨方式</h2>
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-1 block text-sm text-[#8a7f72]">送貨方式</span>
                  <select
                    value={selectedShippingMethod}
                    onChange={(e) => setShippingMethod(e.target.value)}
                    className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5"
                  >
                    {availableShippingMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-[#8a7f72]">付款方式</span>
                  <select
                    value={selectedPaymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5"
                  >
                    {availablePaymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {/* 收件資料 */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold">收件資料</h2>
              <div className="grid gap-3">
                <input
                  className="rounded-lg border border-[#e5ded4] px-4 py-3"
                  placeholder="收件人姓名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="rounded-lg border border-[#e5ded4] px-4 py-3"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </section>

            {/* 訂單資訊 */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold">訂單資訊</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-[#6b6156]">
                  <span>小計</span>
                  <span>{formatter.format(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[#6b6156]">
                  <span>運費</span>
                  <span>{shipping === 0 ? '免運' : formatter.format(shipping)}</span>
                </div>
                {applied && (
                  <div className="flex justify-between text-[#1f7a44]">
                    <span>折扣 {applied.code}</span>
                    <span>-{formatter.format(applied.amount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-lg font-semibold">
                  <span>合計</span>
                  <span className="text-[#c84767]">{formatter.format(total)}</span>
                </div>
              </div>

              {message && (
                <p
                  className={`mt-4 rounded-lg px-4 py-2 text-sm ${
                    message.type === 'ok' ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdecec] text-[#c0392b]'
                  }`}
                >
                  {message.text}
                </p>
              )}

              <button
                className="mt-5 w-full rounded-full bg-[#c84767] px-5 py-3.5 font-semibold text-white disabled:opacity-60"
                onClick={submitOrder}
                disabled={submitting}
              >
                {submitting ? '送出中…' : '前往結帳'}
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
