'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product, Recipient, SiteSettings, UserCoupon } from '@/lib/types';
import { isOnlinePayment } from '@/lib/payment';
import { TW_CITIES, TW_REGIONS } from '@/lib/tw-regions';
import { computeShipping, resolveMethodFee } from '@/lib/shipping';
import ShopHeader from '@/app/components/ShopHeader';

const CART_KEY = 'cart';

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

type PickupStore = {
  store_id: string;
  store_name: string;
  store_phone: string;
  store_address: string;
  store_ship_type: string;
  store_lgs_type: string;
};

const SHIPPING_METHODS = ['全家取貨付款', '全家取貨不付款', '7-11取貨付款', '7-11取貨不付款', '宅配到府'];
const PAYMENT_METHODS = ['信用卡付款', 'Apple Pay', '轉帳匯款'];
const PICKUP_STORE_KEY = 'newebpay-pickup-store';

function isStorePickupMethod(method = '') {
  return /超商|取貨|7-?11|7-ELEVEN|全家|family|萊爾富|hi-?life|ok/i.test(method);
}

// 「取貨付款」= 到店由藍新代收,結帳不需再選付款方式;「取貨不付款」「宅配」才需線上付款。
const COD_PAYMENT_LABEL = '取貨付款(門市付款)';
function isCodPickupMethod(method = '') {
  return /取貨付款/.test(method) && !/不付款/.test(method);
}

function shipTypeFromCheckout(method = '') {
  if (/全家|family/i.test(method)) return '2';
  if (/萊爾富|hi-?life/i.test(method)) return '3';
  if (/\bok\b|ok mart/i.test(method)) return '4';
  return '1';
}

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
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [note, setNote] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [toast, setToast] = useState('');
  const [shippingMethod, setShippingMethod] = useState(SHIPPING_METHODS[0]);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [discountInput, setDiscountInput] = useState('');
  const [memberCoupons, setMemberCoupons] = useState<UserCoupon[]>([]);
  const [applied, setApplied] = useState<{ code: string; amount: number; userCouponId?: string } | null>(null);
  const [couponChecks, setCouponChecks] = useState<Record<string, { ok: boolean; discount: number; error?: string; label?: string }>>({});
  const [discountMsg, setDiscountMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [orderNo, setOrderNo] = useState('');
  const [transferOpen, setTransferOpen] = useState(true);
  const [pickupStore, setPickupStore] = useState<PickupStore | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      setCart(readCart());
      try {
        const rawStore = localStorage.getItem(PICKUP_STORE_KEY);
        if (rawStore) setPickupStore(JSON.parse(rawStore) as PickupStore);
      } catch {
        /* 略過 */
      }
      setLoaded(true);
    });

    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.email) { setEmail(data.email); setIsMember(true); }
        if (data?.name) setName(data.name);
        if (data?.phone) setPhone(data.phone);
        if (data?.address) setAddress(data.address);
        if (Array.isArray(data?.recipients)) setRecipients(data.recipients);
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

    fetch('/api/user-coupons')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMemberCoupons((data?.owned ?? []).filter((item: UserCoupon) => item.status === 'available')))
      .catch(() => setMemberCoupons([]));
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const siteShippingMethods = settings?.enabled_shipping_methods?.length
    ? settings.enabled_shipping_methods
    : settings?.shipping_methods?.length
      ? settings.shipping_methods
      : SHIPPING_METHODS;
  const sitePaymentMethods = settings?.enabled_payment_methods?.length
    ? settings.enabled_payment_methods
    : settings?.payment_methods?.length
      ? settings.payment_methods
      : PAYMENT_METHODS;
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
  const shipping = computeShipping(subtotal, cart, products, selectedShippingMethod, resolveMethodFee(settings, selectedShippingMethod));
  const total = Math.max(0, subtotal + shipping - (applied?.amount ?? 0));
  const needsPickupStore = isStorePickupMethod(selectedShippingMethod);
  // 常用收件人依模式篩選:超商模式只顯示「常用取貨門市」且同一超商;宅配模式只顯示「宅配收件人」
  const visibleRecipients = recipients
    .map((r, i) => ({ r, i }))
    .filter(({ r }) =>
      needsPickupStore
        ? r.type === 'store' && (!r.store_ship_type || r.store_ship_type === shipTypeFromCheckout(selectedShippingMethod))
        : r.type !== 'store',
    );
  // 超商取貨:收件地址=門市;宅配:縣市+行政區+詳細地址
  const finalAddress = needsPickupStore
    ? (pickupStore ? `${pickupStore.store_name} ${pickupStore.store_address}`.trim() : '')
    : [city, district, address].filter(Boolean).join('');
  // 取貨付款(門市代收):不需線上付款、鎖定付款方式;其餘(宅配 / 取貨不付款)才選付款方式
  const codPickup = isCodPickupMethod(selectedShippingMethod);
  const selectedPaymentMethod = codPickup
    ? COD_PAYMENT_LABEL
    : availablePaymentMethods.includes(paymentMethod)
      ? paymentMethod
      : availablePaymentMethods[0] ?? '';
  // 非藍新付款方式(如銀行轉帳)的收款帳號資訊
  const paymentAccount = (settings?.payment_accounts ?? []).find(
    (a) => a.name === selectedPaymentMethod && (a.info ?? '').trim(),
  );
  const showAccountInfo = Boolean(paymentAccount) && !isOnlinePayment(selectedPaymentMethod);

  useEffect(() => {
    if (!pickupStore) return;
    const clearStore = () => {
      setPickupStore(null);
      try { localStorage.removeItem(PICKUP_STORE_KEY); } catch { /* 略過 */ }
    };
    // 改成非超商取貨,或改選不同超商(ship_type 不同)→ 已選門市失效,需重新選擇
    if (!needsPickupStore) { clearStore(); return; }
    const wantShipType = shipTypeFromCheckout(selectedShippingMethod);
    if (pickupStore.store_ship_type && pickupStore.store_ship_type !== wantShipType) clearStore();
  }, [needsPickupStore, pickupStore, selectedShippingMethod]);

  useEffect(() => {
    let alive = true;
    if (!loaded || memberCoupons.length === 0 || subtotal <= 0) {
      setCouponChecks({});
      return;
    }
    Promise.all(
      memberCoupons.map(async (item) => {
        const coupon = item.coupon;
        if (!coupon) return [item.id, { ok: false, discount: 0, error: '優惠券資料不完整' }] as const;
        try {
          const res = await fetch('/api/discounts/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: coupon.code,
              subtotal,
              shipping,
              user_coupon_id: item.id,
              items: cart.map((entry) => ({
                productId: entry.productId,
                name: entry.name,
                variant: entry.variant,
                price: entry.price,
                quantity: entry.quantity,
              })),
            }),
          });
          const data = await res.json();
          return [item.id, res.ok ? { ok: true, discount: data.discount, label: data.label } : { ok: false, discount: 0, error: data.error ?? '不可使用' }] as const;
        } catch {
          return [item.id, { ok: false, discount: 0, error: '檢查失敗' }] as const;
        }
      }),
    ).then((entries) => {
      if (alive) setCouponChecks(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [cart, loaded, memberCoupons, shipping, subtotal]);

  // 用彈出視窗開藍新電子地圖:選完由回傳頁 postMessage 帶回門市,結帳頁不換頁
  function openStoreMap(shipType: string) {
    const url = `/api/logistics/newebpay/store-map?ship_type=${encodeURIComponent(shipType)}&lgs_type=C2C`;
    // 超商電子地圖頁面較寬,彈窗需夠大並可捲動,否則按不到確認鈕
    const width = Math.min(1040, window.screen.availWidth || 1040);
    const height = Math.min(820, window.screen.availHeight || 820);
    const left = Math.max(0, ((window.screen.availWidth || width) - width) / 2);
    const top = Math.max(0, ((window.screen.availHeight || height) - height) / 2);
    const w = window.open(
      url,
      'newebpay-storemap',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    );
    if (!w) { window.location.href = url; } // 彈窗被擋 → 退回同頁流程
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'newebpay-pickup-store') return;
      try {
        const store = JSON.parse(e.data.store) as PickupStore;
        if (store?.store_id) {
          setPickupStore(store);
          try { localStorage.setItem(PICKUP_STORE_KEY, JSON.stringify(store)); } catch { /* 略過 */ }
        }
      } catch { /* 略過 */ }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function fillRecipient(idx: number) {
    const r = recipients[idx];
    if (!r) return;
    setName(r.name || '');
    setPhone(r.phone || '');
    if (r.type === 'store' && r.store_id) {
      const store: PickupStore = {
        store_id: r.store_id, store_name: r.store_name ?? '', store_phone: r.store_phone ?? '',
        store_address: r.store_address ?? '', store_ship_type: r.store_ship_type ?? '', store_lgs_type: 'C2C',
      };
      setPickupStore(store);
      try { localStorage.setItem(PICKUP_STORE_KEY, JSON.stringify(store)); } catch { /* 略過 */ }
    } else {
      setCity(r.city || '');
      setDistrict(r.district || '');
      setAddress(r.address || '');
    }
  }

  async function saveRecipient() {
    if (savingRecipient) return;
    if (!name.trim() || !phone.trim()) { setMessage({ type: 'err', text: '請先填寫收件人姓名與電話' }); return; }
    if (needsPickupStore && !pickupStore?.store_id) { setMessage({ type: 'err', text: '請先選擇取貨門市再加入常用取貨人' }); return; }
    setSavingRecipient(true);
    try {
      const next: Recipient = needsPickupStore
        ? {
            name: name.trim(), phone: phone.trim(), city: '', district: '', address: '', type: 'store',
            store_id: pickupStore?.store_id ?? '', store_name: pickupStore?.store_name ?? '',
            store_address: pickupStore?.store_address ?? '', store_phone: pickupStore?.store_phone ?? '',
            store_ship_type: pickupStore?.store_ship_type ?? '',
          }
        : { name: name.trim(), phone: phone.trim(), city, district, address: address.trim(), type: 'home' };
      const list = [...recipients, next];
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: list }),
      });
      if (!res.ok) { setMessage({ type: 'err', text: '加入常用收件人失敗' }); return; }
      setRecipients(list);
      setToast(needsPickupStore ? '已加入常用取貨人' : '已加入常用收件人');
      window.setTimeout(() => setToast(''), 3000);
    } catch {
      setMessage({ type: 'err', text: '加入常用收件人失敗，請稍後再試' });
    } finally {
      setSavingRecipient(false);
    }
  }

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

  async function applyDiscount(code = discountInput, userCouponId = '') {
    setDiscountMsg('');
    if (!code.trim()) return;
    try {
      const res = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          subtotal,
          shipping,
          user_coupon_id: userCouponId,
          items: cart.map((item) => ({
            productId: item.productId,
            name: item.name,
            variant: item.variant,
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplied({ code: data.code, amount: data.discount, userCouponId: data.user_coupon_id });
        setDiscountInput(data.code);
        setDiscountMsg(`已套用 ${data.code}，此訂單省 ${formatter.format(data.discount)}`);
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
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setMessage({ type: 'err', text: '請填寫收件人姓名、電話與 Email' });
      return;
    }
    if (!/^0\d{8,9}$/.test(phone.replace(/\D/g, ''))) {
      setMessage({ type: 'err', text: '電話格式不正確,請輸入正確的手機或市話(例:0912345678)' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage({ type: 'err', text: 'Email 格式不正確' });
      return;
    }
    if (!needsPickupStore && (!city || !district || !address.trim())) {
      setMessage({ type: 'err', text: '請選擇縣市、行政區並填寫詳細地址' });
      return;
    }
    if (!selectedShippingMethod || !selectedPaymentMethod) {
      setMessage({ type: 'err', text: '購物車內商品沒有共同可用的付款或送貨方式' });
      return;
    }
    if (needsPickupStore && !pickupStore?.store_id) {
      setMessage({ type: 'err', text: '請先選擇超商取貨門市' });
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
          phone,
          address: finalAddress,
          note,
          shipping_method: selectedShippingMethod,
          payment_method: selectedPaymentMethod,
          store_id: needsPickupStore ? pickupStore?.store_id ?? '' : '',
          store_name: needsPickupStore ? pickupStore?.store_name ?? '' : '',
          store_phone: needsPickupStore ? pickupStore?.store_phone ?? '' : '',
          store_address: needsPickupStore ? pickupStore?.store_address ?? '' : '',
          store_ship_type: needsPickupStore ? pickupStore?.store_ship_type ?? shipTypeFromCheckout(selectedShippingMethod) : '',
          store_lgs_type: needsPickupStore ? pickupStore?.store_lgs_type ?? 'C2C' : '',
          discount_code: applied?.code ?? '',
          user_coupon_id: applied?.userCouponId ?? '',
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
        setCart([]);
        try {
          localStorage.removeItem(CART_KEY);
          localStorage.removeItem(PICKUP_STORE_KEY);
        } catch {
          /* 略過 */
        }
        // 藍新線上金流:建單後導向藍新付款頁(不在此顯示訂單成立)
        if (isOnlinePayment(selectedPaymentMethod)) {
          window.location.href = `/api/payment/newebpay/checkout?order=${encodeURIComponent(data.order_no)}`;
          return;
        }
        setOrderNo(data.order_no);
      }
    } catch {
      setMessage({ type: 'err', text: '連線發生問題，請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <ShopHeader logoUrl={settings?.logo_url ?? ''} leftLabel="← 回商店" cartCount={cartCount} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-wide">訂單結帳</h1>

        {orderNo ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-[#1f7a44]">訂單成立！</p>
            <p className="mt-2 text-[#6b6156]">單號：{orderNo}</p>
            <p className="mt-1 text-sm text-[#8a7f72]">我們會盡快為你備貨，感謝購買。</p>
            {showAccountInfo && paymentAccount ? (
              <div className="mx-auto mt-5 max-w-sm rounded-xl border border-[#d8c7a8] bg-[#faf6ea] p-4 text-left">
                <p className="text-sm font-semibold text-[#8a6d1b]">{paymentAccount.name} — 收款資訊</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#6b6156]">{paymentAccount.info}</p>
                <p className="mt-2 text-xs text-[#a99e8f]">請完成付款後保留交易明細，方便我們對帳。</p>
              </div>
            ) : null}
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
              {memberCoupons.length > 0 && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  {memberCoupons.map((item) => {
                    const coupon = item.coupon;
                    if (!coupon) return null;
                    const check = couponChecks[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => applyDiscount(coupon.code, item.id)}
                        disabled={check ? !check.ok : false}
                        className={`rounded-xl border p-3 text-left ${
                          applied?.userCouponId === item.id
                            ? 'border-[#1f1b19] bg-[#faf7f2]'
                            : check?.ok === false
                              ? 'border-[#e5ded4] bg-[#f6f2ec] opacity-70'
                              : 'border-[#e5ded4] bg-white'
                        }`}
                      >
                        <span className="block font-mono font-bold">{coupon.code}</span>
                        <span className="mt-1 block text-xs text-[#8a7f72]">
                          {coupon.type === 'free_shipping' ? '免運' : coupon.type === 'percent' ? `${coupon.value}% 折扣` : `折抵 ${formatter.format(coupon.value)}`}
                          {coupon.min_spend > 0 ? ` / 滿 ${formatter.format(coupon.min_spend)}` : ''}
                        </span>
                        <span className={`mt-2 block text-xs ${check?.ok ? 'text-[#1f7a44]' : 'text-[#c0392b]'}`}>
                          {check ? (check.ok ? `此訂單可省 ${formatter.format(check.discount)}` : check.error) : '檢查中...'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  placeholder="輸入優惠代碼"
                  className="flex-1 rounded-lg border border-[#e5ded4] px-4 py-2.5 text-sm"
                />
                <button
                  onClick={() => applyDiscount()}
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
                {needsPickupStore ? (
                  <div className="rounded-xl border border-[#e5ded4] bg-[#faf7f2] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1f1b19]">取貨門市</p>
                        {pickupStore ? (
                          <div className="mt-1 text-sm leading-6 text-[#6b6156]">
                            <p>{pickupStore.store_name}（{pickupStore.store_id}）</p>
                            <p>{pickupStore.store_address}</p>
                            {pickupStore.store_phone ? <p>{pickupStore.store_phone}</p> : null}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-[#c0392b]">尚未選擇門市</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openStoreMap(shipTypeFromCheckout(selectedShippingMethod))}
                        className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white"
                      >
                        {pickupStore ? '重新選擇' : '選擇門市'}
                      </button>
                    </div>
                  </div>
                ) : null}
                {codPickup ? (
                  <div className="rounded-xl border border-[#e5ded4] bg-[#faf7f2] p-4 text-sm">
                    <p className="font-semibold text-[#1f1b19]">付款方式：門市取貨付款</p>
                    <p className="mt-1 text-[#6b6156]">此方式為到門市取貨時付款（藍新代收），下單後不需線上付款。</p>
                  </div>
                ) : (
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
                )}
              </div>
            </section>

            {/* 收件資料 */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold">收件資料</h2>
              {visibleRecipients.length > 0 ? (
                <label className="mb-3 block">
                  <span className="mb-1 block text-sm text-[#8a7f72]">{needsPickupStore ? '常用取貨門市' : '常用收件人'}</span>
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value !== '') fillRecipient(Number(e.target.value)); }}
                    className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5"
                  >
                    <option value="">{needsPickupStore ? '選擇常用取貨門市自動帶入…' : '選擇常用收件人自動帶入…'}</option>
                    {visibleRecipients.map(({ r, i }) => (
                      <option key={i} value={i}>
                        {r.type === 'store'
                          ? `${r.name}（${r.phone}）${r.store_name ?? ''}`
                          : `${r.name}（${r.phone}）${[r.city, r.district].filter(Boolean).join('')}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="rounded-lg border border-[#e5ded4] px-4 py-3"
                    placeholder="收件人姓名(本名)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className="rounded-lg border border-[#e5ded4] px-4 py-3"
                    placeholder="收件人電話"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <input
                  className="rounded-lg border border-[#e5ded4] px-4 py-3"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                {needsPickupStore ? (
                  <p className="rounded-lg bg-[#faf7f2] px-4 py-3 text-sm text-[#8a7f72]">
                    超商取貨免填地址，取貨門市請於上方「選擇門市」設定。
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        className="rounded-lg border border-[#e5ded4] px-3 py-3"
                        value={city}
                        onChange={(e) => { setCity(e.target.value); setDistrict(''); }}
                      >
                        <option value="">選擇縣市</option>
                        {TW_CITIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <select
                        className="rounded-lg border border-[#e5ded4] px-3 py-3 disabled:bg-[#f6f2ec]"
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        disabled={!city}
                      >
                        <option value="">選擇行政區</option>
                        {(TW_REGIONS[city] ?? []).map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      className="rounded-lg border border-[#e5ded4] px-4 py-3"
                      placeholder="詳細地址(路/街、門牌號)"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </>
                )}

                {isMember ? (
                  <button
                    type="button"
                    onClick={saveRecipient}
                    disabled={savingRecipient}
                    className="justify-self-start rounded-full border border-[#1f1b19] px-4 py-2 text-sm font-semibold text-[#1f1b19] hover:bg-[#1f1b19] hover:text-white disabled:opacity-50"
                  >
                    ＋ {needsPickupStore ? '加入常用取貨人' : '加入常用收件人'}
                  </button>
                ) : null}

                <textarea
                  className="rounded-lg border border-[#e5ded4] px-4 py-3"
                  placeholder="訂單備註(選填)"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
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

              {/* 轉帳匯款:開合式面板,展開訂單明細 + 收件資訊 + 賣家匯款帳號 */}
              {showAccountInfo && paymentAccount ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-[#d8c7a8] bg-[#faf6ea]">
                  <button
                    type="button"
                    onClick={() => setTransferOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold text-[#8a6d1b]">匯款資訊與訂單明細</span>
                    <span className="text-[#8a6d1b]">{transferOpen ? '▲' : '▼'}</span>
                  </button>
                  {transferOpen ? (
                    <div className="space-y-3 border-t border-[#e8d9b6] px-4 py-3 text-sm">
                      <div>
                        <p className="mb-1 font-semibold text-[#8a6d1b]">賣家收款帳號</p>
                        <p className="whitespace-pre-wrap text-[#6b6156]">{paymentAccount.info}</p>
                      </div>
                      <div className="border-t border-[#e8d9b6] pt-2">
                        <p className="mb-1 font-semibold text-[#8a6d1b]">訂單金額</p>
                        <div className="flex justify-between text-[#6b6156]"><span>小計</span><span>{formatter.format(subtotal)}</span></div>
                        <div className="flex justify-between text-[#6b6156]"><span>運費</span><span>{shipping === 0 ? '免運' : formatter.format(shipping)}</span></div>
                        {applied ? <div className="flex justify-between text-[#1f7a44]"><span>折扣 {applied.code}</span><span>-{formatter.format(applied.amount)}</span></div> : null}
                        <div className="flex justify-between pt-1 font-semibold"><span>應付總額</span><span className="text-[#c84767]">{formatter.format(total)}</span></div>
                      </div>
                      <div className="border-t border-[#e8d9b6] pt-2">
                        <p className="mb-1 font-semibold text-[#8a6d1b]">收件資訊</p>
                        <p className="text-[#6b6156]">{name || '(未填姓名)'}｜{phone || '(未填電話)'}</p>
                        <p className="text-[#6b6156]">{finalAddress || '(未填地址)'}</p>
                        <p className="text-[#6b6156]">{selectedShippingMethod}</p>
                      </div>
                      <p className="text-xs text-[#a99e8f]">請依上方帳號完成匯款,並保留交易明細;送出訂單後也可於「我的訂單 → 立即付款」回報帳號後五碼或上傳截圖。</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

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
                {submitting
                  ? '送出中…'
                  : isOnlinePayment(selectedPaymentMethod)
                    ? '前往藍新付款'
                    : '送出訂單'}
              </button>
            </section>
          </div>
        )}
      </div>

      {/* 加入常用收件人 提示(停約 3 秒後淡出) */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4 transition-all duration-500 ${
          toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 rounded-full bg-[#1f1b19] px-5 py-3 text-sm font-semibold text-white shadow-lg">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f7a44] text-xs">✓</span>
          {toast}
        </div>
      </div>
    </main>
  );
}
