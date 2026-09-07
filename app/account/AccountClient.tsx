'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Customer, Discount, Order, OrderStatusHistory, Product, Recipient, ReturnRequest, SiteSettings, UserCoupon } from '@/lib/types';
import { TW_CITIES, TW_REGIONS } from '@/lib/tw-regions';
import { isOnlinePayment, paymentDeadline } from '@/lib/payment';
import { OrderStatusBadge, orderNeedsAttention, AttentionDot } from '@/app/components/OrderStatusBadge';
import ShopHeader from '@/app/components/ShopHeader';
import { couponImageStyle, couponScript } from '@/lib/coupon-presets';
import { uiAlert } from '@/lib/ui-dialog';
import {
  buildProgress,
  orderTabOf,
  canRequestCancel,
  canRequestReturn,
  ORDER_TABS,
  CANCEL_STATUS_LABEL,
  RETURN_STATUS_LABEL,
  type OrderTab,
} from '@/lib/order-status';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

type TabKey = 'profile' | 'coupons' | 'orders' | 'favorites';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'profile', label: '個人資訊' },
  { key: 'coupons', label: '優惠券及購物金' },
  { key: 'orders', label: '訂單紀錄' },
  { key: 'favorites', label: '追蹤清單' },
];

function couponLabel(d: Discount) {
  const base = d.type === 'free_shipping' ? '免運' : d.type === 'percent' ? `${d.value}% 折扣` : `折抵 ${formatter.format(d.value)}`;
  return d.min_spend > 0 ? `${base}(滿 ${formatter.format(d.min_spend)})` : base;
}

// 是否顯示「立即付款」:未付款、未取消/退貨、無取消申請中或已核准、非退貨處理中。
// 取貨付款/貨到付款(到店付款)不需線上付款,不顯示。
function canPayNow(order: Order): boolean {
  if (order.paid) return false;
  if (order.status === '取消' || order.status === '退貨') return false;
  if (order.cancel_status === 'REQUESTED' || order.cancel_status === 'APPROVED') return false;
  if (['RETURNING', 'RETURNED'].includes(order.fulfillment_status ?? '')) return false;
  if (/取貨付款|貨到付款|cod/i.test(order.payment_method ?? '')) return false;
  return true;
}

function couponScope(d: Discount) {
  const products = d.applicable_products?.length ? `指定商品 ${d.applicable_products.join(', ')}` : '';
  const categories = d.applicable_categories?.length ? `指定分類 ${d.applicable_categories.join(', ')}` : '';
  return [products, categories].filter(Boolean).join(' / ') || '全站適用';
}

export default function AccountClient({
  userName,
  userEmail,
  userPhone,
  userAddress,
  provider,
  orders,
  products,
  favoriteIds,
  coupons,
  customer,
}: {
  userName: string;
  userEmail: string;
  userPhone: string;
  userAddress: string;
  provider: string;
  orders: Order[];
  products: Product[];
  favoriteIds: string[];
  coupons: Discount[];
  customer: Customer | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('profile');

  // 由網址帶入初始分頁(例:/account?tab=orders 直接開啟訂單紀錄)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'profile' || t === 'coupons' || t === 'orders' || t === 'favorites') setTab(t);
  }, []);
  // 切換分頁時同步網址,重新整理停留在原分頁
  const changeTab = (key: TabKey) => {
    setTab(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', key);
      window.history.replaceState(null, '', url);
    } catch { /* 略過 */ }
  };
  const [orderList, setOrderList] = useState<Order[]>(orders);
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [payTarget, setPayTarget] = useState<Order | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<{ name: string; info: string }[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [returnInfo, setReturnInfo] = useState('');
  const [couponHero, setCouponHero] = useState('');
  const [toast, setToast] = useState('');
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('cart');
      const items = raw ? (JSON.parse(raw) as { quantity: number }[]) : [];
      setCartCount(items.reduce((n, i) => n + (i.quantity || 0), 0));
    } catch { /* 略過 */ }
  }, []);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SiteSettings | null) => {
        setPaymentAccounts(data?.payment_accounts ?? []);
        setReturnInfo(data?.return_info ?? '');
        setCouponHero(data?.coupon_hero_image ?? '');
        if (data?.logo_url) setLogoUrl(data.logo_url);
      })
      .catch(() => {});
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3200);
  }

  function applyOrderUpdate(updated: Order) {
    setOrderList((list) => list.map((o) => (o.id === updated.id ? updated : o)));
    setOpenOrder((o) => (o && o.id === updated.id ? updated : o));
  }

  function accountFor(order: Order) {
    return paymentAccounts.find((a) => a.name === order.payment_method && (a.info ?? '').trim()) ?? null;
  }

  // 用商品名稱對應到商品圖(訂單品項沒有存圖片,靠名稱對照)
  const imageByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) if (p.name) m.set(p.name, p.image);
    return m;
  }, [products]);

  const favoriteProducts = useMemo(
    () => products.filter((p) => favoriteIds.includes(p.id)),
    [products, favoriteIds],
  );


  // 再次加入購物車:把訂單品項放回購物車(用 productId,舊訂單則用商品名對應)後前往結帳
  function reorder(order: Order) {
    const byName = new Map(products.map((p) => [p.name, p]));
    const toAdd = order.items
      .map((it) => {
        const pid = it.productId || byName.get(it.name)?.id;
        if (!pid) return null;
        return {
          id: `${pid}-${it.variant}`,
          productId: pid,
          name: it.name,
          variant: it.variant,
          price: it.price,
          quantity: it.quantity,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (toAdd.length === 0) {
      void uiAlert('這筆訂單的商品目前已無法加入購物車。');
      return;
    }
    try {
      const raw = localStorage.getItem('cart');
      const existing = raw ? (JSON.parse(raw) as typeof toAdd) : [];
      const map = new Map(existing.map((i) => [i.id, i]));
      for (const item of toAdd) {
        const e = map.get(item.id);
        if (e) e.quantity += item.quantity;
        else map.set(item.id, item);
      }
      localStorage.setItem('cart', JSON.stringify([...map.values()]));
    } catch {
      /* localStorage 不可用時略過 */
    }
    router.push('/checkout');
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <ShopHeader
        logoUrl={logoUrl}
        leftHref="/"
        leftLabel="← 回商店"
        cartCount={cartCount}
        favoriteCount={favoriteIds.length}
        favoriteActive={tab === 'favorites'}
        onFavoriteClick={() => changeTab('favorites')}
      />

      {/* 分頁列 */}
      <div className="border-b border-[#e5ded4] bg-[#faf7f2]">
        <div className="mx-auto max-w-4xl overflow-x-auto overflow-y-hidden px-4 pt-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-end gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => changeTab(t.key)}
              className={`relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-5 py-3 text-center text-sm font-semibold transition-all duration-200 ${
                tab === t.key
                  ? 'rounded-t-2xl border-b-[#8f1f31] bg-white text-[#1f1b19] shadow-[0_-6px_18px_rgba(64,52,43,0.08)]'
                  : 'border-b-transparent text-[#8a7f72] hover:-translate-y-0.5 hover:bg-white/55 hover:text-[#1f1b19]'
              }`}
            >
              {t.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {tab === 'profile' && (
          <ProfileTab
            customer={customer}
            fallbackName={userName}
            email={userEmail}
            fallbackPhone={userPhone}
            fallbackAddress={userAddress}
            provider={provider}
            onSaved={() => router.refresh()}
          />
        )}

        {tab === 'coupons' && <CouponsTab coupons={coupons} heroImage={couponHero} />}

        {tab === 'orders' && (
          <OrdersTab
            orders={orderList}
            imageByName={imageByName}
            onOpen={setOpenOrder}
            onCancel={setCancelTarget}
            onPay={setPayTarget}
          />
        )}

        {tab === 'favorites' && <FavoritesTab products={favoriteProducts} />}
      </section>

      {openOrder && (
        <OrderModal
          order={openOrder}
          imageByName={imageByName}
          returnInfo={returnInfo}
          onClose={() => setOpenOrder(null)}
          onReorder={() => reorder(openOrder)}
          onCancel={setCancelTarget}
          onPay={setPayTarget}
          onOrderChange={applyOrderUpdate}
        />
      )}

      {cancelTarget && (
        <CancelRequestModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={(updated) => { applyOrderUpdate(updated); setCancelTarget(null); showToast('已送出取消申請,請等候賣家審核。'); }}
        />
      )}

      {payTarget && (
        <PayTransferModal
          order={payTarget}
          account={accountFor(payTarget)}
          onClose={() => setPayTarget(null)}
          onDone={(updated) => { applyOrderUpdate(updated); setPayTarget(null); showToast('已收到你的付款回報,賣家會盡快對帳。'); }}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-[#1f1b19] px-5 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}
    </main>
  );
}

/* ---------- 個人資訊 ---------- */
function ProfileTab({
  customer,
  fallbackName,
  email,
  fallbackPhone,
  fallbackAddress,
  provider,
  onSaved,
}: {
  customer: Customer | null;
  fallbackName: string;
  email: string;
  fallbackPhone: string;
  fallbackAddress: string;
  provider: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name || fallbackName || '');
  const [nickname, setNickname] = useState(customer?.nickname || '');
  const [gender, setGender] = useState(customer?.gender || '');
  const [birthday, setBirthday] = useState(customer?.birthday || '');
  const [phone, setPhone] = useState(customer?.phone || fallbackPhone || '');
  const [recipients, setRecipients] = useState<Recipient[]>(
    customer?.recipients?.length
      ? customer.recipients
      : fallbackAddress
        ? [{ name: '', phone: '', city: '', district: '', address: fallbackAddress }]
        : [],
  );
  const [expandedRecipient, setExpandedRecipient] = useState<number | null>(null);
  const [marketing, setMarketing] = useState({
    email: customer?.marketing?.email ?? false,
    sms: customer?.marketing?.sms ?? false,
  });
  const [privacy, setPrivacy] = useState({
    personalization: customer?.privacy?.personalization ?? true,
    show_activity: customer?.privacy?.show_activity ?? false,
  });
  const [recipientView, setRecipientView] = useState<'home' | 'store'>('home');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const displayName = (name || fallbackName || email.split('@')[0] || '會員').trim();
  const shortName = displayName.slice(-2);
  function updateRecipient(i: number, patch: Partial<Recipient>) {
    setRecipients((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRecipient() {
    setRecipientView('home');
    setRecipients((list) => {
      const next: Recipient[] = [...list, { name: '', phone: '', city: '', district: '', address: '', type: 'home' }];
      setExpandedRecipient(next.length - 1);
      return next;
    });
  }
  function removeRecipient(i: number) {
    setRecipients((list) => list.filter((_, idx) => idx !== i));
    setExpandedRecipient(null);
  }

  // ---- 超商常用收件人:直接在帳戶頁選門市(全家 / 7-11),不用等結帳 ----
  const [pendingStoreIndex, setPendingStoreIndex] = useState<number | null>(null);

  function openStoreMap(shipType: string) {
    const url = `/api/logistics/newebpay/store-map?ship_type=${encodeURIComponent(shipType)}&lgs_type=C2C`;
    const width = Math.min(1040, window.screen.availWidth || 1040);
    const height = Math.min(820, window.screen.availHeight || 820);
    const left = Math.max(0, ((window.screen.availWidth || width) - width) / 2);
    const top = Math.max(0, ((window.screen.availHeight || height) - height) / 2);
    const w = window.open(
      url,
      'newebpay-storemap',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    );
    if (!w) void uiAlert('彈跳視窗被瀏覽器擋住,請允許彈跳視窗後再試一次。');
  }

  // 新增一筆超商常用收件人(全家 shipType '2' / 7-11 shipType '1'),建立空白列後立即開門市地圖
  function addStoreRecipient(shipType: string) {
    setRecipientView('store');
    setRecipients((list) => {
      const next: Recipient[] = [...list, { name: '', phone: '', city: '', district: '', address: '', type: 'store', store_ship_type: shipType }];
      const idx = next.length - 1;
      setExpandedRecipient(idx);
      setPendingStoreIndex(idx);
      return next;
    });
    openStoreMap(shipType);
  }

  // 既有超商收件人改選門市(全家/7-11)
  function reselectStore(i: number, shipType: string) {
    setPendingStoreIndex(i);
    openStoreMap(shipType);
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'newebpay-pickup-store') return;
      try {
        const store = JSON.parse(e.data.store) as {
          store_id: string; store_name: string; store_phone: string; store_address: string; store_ship_type: string;
        };
        if (store?.store_id && pendingStoreIndex !== null) {
          updateRecipient(pendingStoreIndex, {
            type: 'store',
            store_id: store.store_id,
            store_name: store.store_name,
            store_phone: store.store_phone,
            store_address: store.store_address,
            store_ship_type: store.store_ship_type,
          });
        }
      } catch { /* 略過 */ } finally {
        setPendingStoreIndex(null);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pendingStoreIndex]);

  // 置中彈出通知(已儲存 / 錯誤訊息):3 秒後自動清除,配合 CSS 動畫淡出
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nickname, gender, birthday, phone, recipients, marketing, privacy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      setMsg({ type: 'ok', text: '已儲存' });
      onSaved();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : '儲存失敗' });
    } finally {
      setSaving(false);
    }
  }

  const field = 'h-10 w-full min-w-0 rounded-lg border border-[#e5ded4] bg-white px-3 text-sm text-[#2c2826] outline-none transition focus:border-[#8f1f31] sm:h-11';
  const labelText = 'mb-1.5 block text-xs font-medium text-[#6f665d]';

  const homeRecipients = recipients.map((r, i) => ({ r, i })).filter(({ r }) => r.type !== 'store');
  const storeRecipients = recipients.map((r, i) => ({ r, i })).filter(({ r }) => r.type === 'store');
  const shownRecipients = recipientView === 'home' ? homeRecipients : storeRecipients;

  const renderRecipientCard = (r: Recipient, i: number) => (
    <div key={i} className="rounded-lg border border-[#eadfd4] bg-[#f7e8e8] p-3">
      {expandedRecipient === i ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>收件人姓名</span>
              <input value={r.name} onChange={(e) => updateRecipient(i, { name: e.target.value })} className={field} />
            </label>
            <label className="block">
              <span className={labelText}>收件人電話</span>
              <input value={r.phone} onChange={(e) => updateRecipient(i, { phone: e.target.value })} className={field} />
            </label>
            {r.type !== 'store' ? (
              <>
                <label className="block">
                  <span className={labelText}>縣市</span>
                  <select value={r.city} onChange={(e) => updateRecipient(i, { city: e.target.value, district: '' })} className={field}>
                    <option value="">請選擇縣市</option>
                    {TW_CITIES.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelText}>行政區</span>
                  <select
                    value={r.district}
                    onChange={(e) => updateRecipient(i, { district: e.target.value })}
                    disabled={!r.city}
                    className={field + ' disabled:bg-[#f6f2ec]'}
                  >
                    <option value="">{r.city ? '請選擇行政區' : '請先選縣市'}</option>
                    {(TW_REGIONS[r.city] ?? []).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </div>
          {r.type === 'store' ? (
            <div className="mt-3 rounded-lg bg-[#faf7f2] px-3 py-2 text-sm text-[#6b6156]">
              常用取貨門市：{r.store_name || '(未設)'}{r.store_id ? `（${r.store_id}）` : ''}
              {r.store_address ? <span className="block text-xs">{r.store_address}</span> : null}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => reselectStore(i, '2')} className="rounded-full border border-[#b79ba0] px-3 py-1 text-xs font-semibold text-[#8f1f31]">
                  改選全家門市
                </button>
                <button type="button" onClick={() => reselectStore(i, '1')} className="rounded-full border border-[#b79ba0] px-3 py-1 text-xs font-semibold text-[#8f1f31]">
                  改選7-11門市
                </button>
              </div>
            </div>
          ) : (
            <label className="mt-3 block">
              <span className={labelText}>詳細地址</span>
              <input value={r.address} onChange={(e) => updateRecipient(i, { address: e.target.value })} placeholder="路 / 街 / 巷弄 / 號 / 樓" className={field} />
            </label>
          )}
          <div className="mt-4 flex items-center gap-4">
            <button type="button" onClick={() => setExpandedRecipient(null)} className="rounded-full bg-[#8f1f31] px-5 py-1.5 text-sm font-semibold text-white">
              完成
            </button>
            <button type="button" onClick={() => removeRecipient(i)} className="text-sm font-semibold text-[#c0392b]">
              刪除此收件人
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="font-serif-tc flex h-12 w-12 shrink-0 items-center justify-center border-r border-[#dccaca] pr-3 text-[#8f1f31]">
              <span className="text-xs font-semibold tracking-[0.16em]">{r.type === 'store' ? '超取' : '宅配'}</span>
            </div>
            <div className="min-w-0">
            <p className="font-semibold">
              {r.name || '(未填姓名)'}
              {r.phone ? <span className="ml-2 text-sm font-normal text-[#6f665d]">{r.phone.replace(/^(\d{4})\d+(\d{3})$/, '$1•••$2')}</span> : null}
            </p>
            <p className="mt-1 truncate text-sm text-[#6f665d]">
              {r.type === 'store'
                ? `超商取貨 · ${r.store_name || r.store_id || '(未設門市)'}`
                : [r.city, r.district, r.address].filter(Boolean).join(' ') || '(未填地址)'}
            </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setExpandedRecipient(i)} aria-label="編輯收件人" className="rounded-full p-2 text-[#6f665d] hover:bg-white/60">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" /></svg>
            </button>
            <button type="button" onClick={() => removeRecipient(i)} aria-label="刪除收件人" className="rounded-full p-2 text-[#6f665d] hover:bg-white/60">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8 pb-24">
      <section className="relative -mx-4 -mt-8 overflow-hidden border-b border-[#eadfd4] bg-[#fbf8f3] px-6 pb-7 pt-6 sm:-mx-6 sm:px-10">
        <img
          src="https://mffhznxcqjlwquqyrgth.supabase.co/storage/v1/object/public/assets/member/urbanite-member-stamp-1788771080926.png"
          alt="URBANITE MEMBER"
          className="absolute right-5 top-8 h-32 w-32 object-contain opacity-85 sm:right-8 sm:h-40 sm:w-40"
        />
        <p className="text-[10px] font-semibold tracking-[0.34em] text-[#8f1f31]/70">MEMBER SPACE</p>
        <h1 className="font-serif-tc mt-3 text-[58px] font-semibold leading-[0.92] tracking-normal text-[#1f1b19] sm:text-[76px]">
          Hello,<br />{shortName}。
        </h1>
        <p className="mt-4 text-base font-semibold tracking-[0.08em] text-[#6f665d]">你的風格，從這裡開始。</p>
      </section>

      <section className="relative border-l border-[#ded5c8] pl-5 sm:pl-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-serif-tc text-sm font-bold text-[#8f1f31]">01</span>
            <h2 className="font-serif-tc text-2xl font-bold tracking-[0.08em]">關於你</h2>
          </div>
          <span className="hidden text-[10px] font-semibold tracking-[0.34em] text-[#6f665d] sm:inline">PROFILE</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:gap-4">
          <label className="block min-w-0">
            <span className={labelText}>姓名</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block min-w-0">
            <span className={labelText}>暱稱</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} className={field} />
          </label>
          <label className="block min-w-0">
            <span className={labelText}>性別</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={field}>
              <option value="">不透露</option>
              <option value="female">女</option>
              <option value="male">男</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className={labelText}>生日</span>
            <input type="date" value={birthday ?? ''} onChange={(e) => setBirthday(e.target.value)} className={field + ' appearance-none text-[13px] [color-scheme:light]'} />
          </label>
          <label className="col-span-2 block min-w-0">
            <span className={labelText}>手機號碼</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" className={field} />
          </label>
          <label className="col-span-2 block min-w-0">
            <span className={labelText}>Email</span>
            <input value={email} disabled className={field + ' bg-[#f0ece6] text-[#8a7f72]'} />
          </label>
        </div>
        <p className="mt-3 text-xs text-[#8a7f72]">{provider} 帳號登入</p>
      </section>

      <section className="relative border-l border-[#ded5c8] pl-5 sm:pl-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-serif-tc text-sm font-bold text-[#8f1f31]">02</span>
            <h2 className="font-serif-tc text-2xl font-bold tracking-[0.08em]">收件日常</h2>
          </div>
          <span className="hidden text-[10px] font-semibold tracking-[0.34em] text-[#6f665d] sm:inline">ADDRESS BOOK</span>
        </div>
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRecipientView('home')}
            className={`flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm font-semibold transition ${
              recipientView === 'home' ? 'bg-[#8f1f31] text-white shadow-sm' : 'bg-white text-[#6f665d]'
            }`}
          >
            宅配到府
          </button>
          <button
            type="button"
            onClick={() => setRecipientView('store')}
            className={`flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm font-semibold transition ${
              recipientView === 'store' ? 'bg-[#8f1f31] text-white shadow-sm' : 'bg-white text-[#6f665d]'
            }`}
          >
            超商取貨
          </button>
          {recipientView === 'home' ? (
            <button type="button" onClick={addRecipient} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-[#b79ba0] px-4 text-sm font-semibold text-[#8f1f31]">
              <span className="text-lg leading-none">+</span>新增
            </button>
          ) : (
            <>
              <button type="button" onClick={() => addStoreRecipient('2')} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-[#b79ba0] px-3 text-sm font-semibold text-[#8f1f31]">
                <span className="text-lg leading-none">+</span>全家
              </button>
              <button type="button" onClick={() => addStoreRecipient('1')} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-[#b79ba0] px-3 text-sm font-semibold text-[#8f1f31]">
                <span className="text-lg leading-none">+</span>7-11
              </button>
            </>
          )}
        </div>
        <div className="space-y-3">
          {shownRecipients.length === 0 ? (
            <p className="rounded-lg bg-white p-4 text-sm text-[#a99e8f]">
              {recipientView === 'home' ? '尚未設定宅配地址。' : '點選上方「全家」或「7-11」新增常用取貨門市。'}
            </p>
          ) : (
            shownRecipients.map(({ r, i }) => renderRecipientCard(r, i))
          )}
        </div>
      </section>

      <section className="relative -mx-4 bg-[#f4e4e4] px-6 py-3 sm:-mx-6 sm:px-10 sm:py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-serif-tc text-sm font-bold text-[#8f1f31]">03</span>
            <h2 className="font-serif-tc text-2xl font-bold tracking-[0.08em]">你的偏好</h2>
          </div>
          <span className="hidden text-[10px] font-semibold tracking-[0.34em] text-[#6f665d] sm:inline">PREFERENCES</span>
        </div>
        <div className="space-y-2.5">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-[#6f665d]">訊息訂閱</p>
            <div className="space-y-1.5">
              <ToggleRow label="訂閱 Email 電子報" icon="mail" checked={marketing.email} onChange={(v) => setMarketing((m) => ({ ...m, email: v }))} />
              <ToggleRow label="接收簡訊優惠通知" icon="chat" checked={marketing.sms} onChange={(v) => setMarketing((m) => ({ ...m, sms: v }))} />
            </div>
          </div>
          <div className="border-t border-[#decaca] pt-2.5">
            <p className="mb-1.5 text-sm font-semibold text-[#6f665d]">隱私設定</p>
            <div className="space-y-1.5">
              <ToggleRow label="允許依購物紀錄提供個人化推薦" desc="依購物紀錄推薦適合你的單品" icon="star" checked={privacy.personalization} onChange={(v) => setPrivacy((p) => ({ ...p, personalization: v }))} />
              <ToggleRow label="公開我的追蹤清單活動" icon="eye" checked={privacy.show_activity} onChange={(v) => setPrivacy((p) => ({ ...p, show_activity: v }))} />
            </div>
          </div>
        </div>
      </section>

      {msg && (
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-4">
          <div className={`center-toast rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg ${msg.type === 'ok' ? 'bg-[#1f7a44]' : 'bg-[#c0392b]'}`}>
            {msg.text}
          </div>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadfd4] bg-[#fbf8f3]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 shadow-[0_-10px_24px_rgba(64,52,43,0.08)] backdrop-blur">
        <button onClick={save} disabled={saving} className="mx-auto flex h-12 w-full max-w-4xl items-center justify-center gap-3 rounded-lg bg-[#8f1f31] px-6 text-sm font-semibold tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(143,31,49,0.22)] disabled:opacity-40">
          {saving ? '儲存中…' : '儲存變更'}
          <span aria-hidden>→</span>
        </button>
        <div className="mx-auto mt-2 flex max-w-4xl items-center gap-4 text-center text-[#b3a48d]">
          <span className="h-px flex-1 bg-[#ded5c8]" />
          <span className="text-[11px] font-semibold tracking-[0.18em]">讓每一次造訪，都更貼近你。</span>
          <span className="h-px flex-1 bg-[#ded5c8]" />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, icon, checked, onChange }: { label: string; desc?: string; icon?: 'mail' | 'chat' | 'star' | 'eye'; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-7 items-center justify-between gap-2">
      <span className="flex min-w-0 items-start gap-2 text-[13px] text-[#3d3935]">
        <PreferenceIcon type={icon} />
        <span className="min-w-0">
          <span className="block whitespace-nowrap font-medium">{label}</span>
          {desc ? <span className="mt-0.5 block text-[11px] leading-tight text-[#8a7f72]">{desc}</span> : null}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={'relative h-6 w-10 shrink-0 rounded-full transition ' + (checked ? 'bg-[#8f1f31]' : 'bg-[#cfc2b8]')}
      >
        <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ' + (checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

function PreferenceIcon({ type }: { type?: 'mail' | 'chat' | 'star' | 'eye' }) {
  if (type === 'mail') return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8f1f31" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
  if (type === 'chat') return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8f1f31" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H8l-5 2 1.8-4A8 8 0 1 1 21 12z" /></svg>;
  if (type === 'star') return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8f1f31" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3z" /></svg>;
  if (type === 'eye') return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8f1f31" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
  return null;
}

/* ---------- 優惠券及購物金 ---------- */
function CouponsTab({ coupons, heroImage = '' }: { coupons: Discount[]; heroImage?: string }) {
  const [owned, setOwned] = useState<UserCoupon[]>([]);
  const [claimable, setClaimable] = useState<Discount[]>(coupons);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [couponTab, setCouponTab] = useState<'available' | 'used' | 'expired'>('available');

  async function refreshCoupons() {
    setLoading(true);
    try {
      const res = await fetch('/api/user-coupons');
      const data = await res.json();
      if (res.ok) {
        setOwned(data.owned ?? []);
        setClaimable(data.ready === false ? coupons : data.claimable ?? []);
        setReady(data.ready !== false);
      }
    } catch {
      setReady(false);
      setClaimable(coupons);
    } finally {
      setLoading(false);
    }
  }

  async function claimCoupon(couponId: string) {
    const res = await fetch('/api/user-coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coupon_id: couponId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '領取失敗');
    refreshCoupons();
  }

  useEffect(() => {
    refreshCoupons();
  }, []);

  const ownedShown = owned.filter((item) => (couponTab === 'expired' ? ['expired', 'revoked'].includes(item.status) : item.status === couponTab));
  const availableCount = owned.filter((i) => i.status === 'available').length;
  return (
    <div className="space-y-9">
      {/* HERO:全出血標題 + 購物金卡 */}
      <section className="relative -mx-4 -mt-8 overflow-hidden bg-[#e9dfd0] sm:-mx-6">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[52%] bg-[#e4d9c8] bg-cover bg-center"
          style={heroImage ? {
            backgroundImage: `url("${heroImage}")`,
            WebkitMaskImage: 'linear-gradient(to right, transparent, #000 42%)',
            maskImage: 'linear-gradient(to right, transparent, #000 42%)',
          } : {
            backgroundImage: 'radial-gradient(circle at 60% 15%, rgba(255,255,255,.55), transparent 34%), linear-gradient(135deg, #d8cab9, #efe6d9 52%, #cdbba9)',
          }}
        >
          {heroImage ? null : (
            <p className="font-script absolute right-6 top-8 text-right text-[34px] leading-[1.15] text-[#b0a08a] sm:text-[42px]">
              Good<br />Outfit<br />Brighter<br />Days.
            </p>
          )}
        </div>
        <div className="relative px-5 pb-5 pt-9 sm:px-8 sm:pb-7 sm:pt-11">
          <h2 className="font-serif-tc text-[34px] font-semibold leading-none tracking-[0.22em] text-[#2c2826] sm:text-[40px]">我的優惠</h2>
          <p className="mt-3 text-[11px] tracking-[0.4em] text-[#a2957f] sm:text-xs">MY COUPONS</p>
          <p className="mt-3.5 text-sm text-[#6b6156] sm:text-base">收藏喜歡的優惠，享受更好的購物體驗。</p>

          <div className="mt-7 flex items-center gap-4 rounded-[22px] bg-white/55 p-4 shadow-[0_8px_24px_rgba(64,52,43,0.06)] backdrop-blur-[2px] sm:p-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/60 text-[#6b6156]">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7S9 3 6.5 4.5 8 9 12 7zM12 7s3-4 5.5-2.5S16 9 12 7z" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-[#5f564b]">購物金</p>
              <p className="flex items-center gap-2 text-[34px] font-bold leading-tight text-[#2c2826]">
                {formatter.format(0)}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#a2957f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </p>
              <p className="mt-1 text-xs text-[#7d7264] sm:text-sm">目前尚無購物金，消費與活動可累積。</p>
            </div>
          </div>
        </div>
      </section>

      {/* 我的優惠券 */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-serif-tc text-[24px] font-bold tracking-[0.06em] sm:text-[26px]">我的優惠券</h3>
          <div className="flex rounded-full bg-[#eae1d4] p-1 text-xs font-medium sm:text-sm">
            {([['available', `可使用 (${availableCount})`], ['used', '已使用'], ['expired', '已過期']] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setCouponTab(key)} className={`rounded-full px-4 py-1.5 transition sm:px-5 ${couponTab === key ? 'bg-[#2b2723] font-semibold text-white' : 'text-[#8a7f72]'}`}>{label}</button>
            ))}
          </div>
        </div>
        {!ready && <p className="mt-3 rounded-lg bg-[#fff8e8] px-4 py-3 text-sm text-[#8a6d2f]">會員領券資料表尚未建立，目前先顯示可輸入的優惠碼。</p>}
        {loading ? (
          <p className="mt-5 rounded-xl bg-white p-5 text-sm text-[#6b6156]">載入優惠券中…</p>
        ) : ownedShown.length === 0 ? (
          <p className="mt-5 rounded-xl bg-white p-5 text-sm text-[#6b6156]">目前沒有{couponTab === 'available' ? '可用' : couponTab === 'used' ? '已使用' : '已過期'}的優惠券。</p>
        ) : (
          <div className="mt-5 space-y-3">
            {ownedShown.map((item) => {
              const c = item.coupon;
              if (!c) return null;
              return (
                <CouponTicket
                  key={item.id}
                  code={c.code}
                  image={c.image ?? undefined}
                  desc={couponLabel(c)}
                  tags={[couponScope(c), c.end_at ? `到 ${new Date(c.end_at).toLocaleDateString('zh-TW')}` : '無期限']}
                  dim={item.status !== 'available'}
                  action={
                    <span className={`inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1.5 text-center text-xs font-semibold leading-none sm:px-4 sm:py-2 sm:text-sm ${item.status === 'available' ? 'bg-[#2b2723] text-white' : 'bg-[#f0e9dd] text-[#8a7f72]'}`}>
                      {item.status === 'used' ? '已使用' : item.status === 'revoked' ? '已撤回' : item.status === 'expired' ? '已過期' : '結帳可用'}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <div className="h-px bg-[#ded5c8]" />

      {/* 可領取優惠券 */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif-tc text-[24px] font-bold tracking-[0.06em] sm:text-[26px]">可領取優惠券</h3>
          <p className="text-xs text-[#a99e8f] sm:text-sm">不定期推出優惠活動，記得常回來看看！</p>
        </div>
        {claimable.length === 0 ? (
          <p className="mt-5 rounded-xl bg-white p-5 text-sm text-[#6b6156]">目前沒有可領取的優惠券。</p>
        ) : (
          <div className="mt-5 space-y-3">
            {claimable.map((c) => (
              <CouponTicket
                key={c.id}
                code={c.code}
                image={c.image ?? undefined}
                desc={couponLabel(c)}
                tags={[couponScope(c)]}
                showScript={false}
                divided
                action={
                  <button
                    type="button"
                    onClick={() => claimCoupon(c.id)}
                    disabled={!ready}
                    className="inline-flex max-w-full shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-[#2b2723] px-3 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-40 sm:gap-1.5 sm:px-5 sm:py-2.5 sm:text-sm"
                  >
                    領取
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 sm:h-[15px] sm:w-[15px]"><path d="M12 4v12M6 12l6 6 6-6M5 20h14" /></svg>
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* 底部標語 */}
      <div className="flex items-center gap-5 pt-1 text-[#b3a48d]">
        <p className="font-serif-tc shrink-0 text-[11px] leading-[1.8] tracking-[0.18em] sm:text-xs">
          &quot;A BETTER OUTFIT<br />A BRIGHTER YOU.&quot;
        </p>
        <span className="h-px flex-1 bg-[#ded5c8]" />
        <p className="font-serif-tc shrink-0 text-[11px] tracking-[0.34em] sm:text-xs">URBANITE</p>
      </div>
    </div>
  );
}

/* 票券卡:左側圖 + 打孔缺口 + 右側操作票根 */
function CouponTicket({ code, image, desc, tags, action, dim = false, showScript = true, divided = false }: {
  code: string;
  image?: string;
  desc: string;
  tags: string[];
  action: ReactNode;
  dim?: boolean;
  showScript?: boolean;
  divided?: boolean;
}) {
  return (
    <div className={`coupon-ticket-shell relative flex items-stretch drop-shadow-[0_8px_18px_rgba(64,52,43,0.08)] ${dim ? 'opacity-65' : ''}`}>
      {/* 照片票根 */}
      <div
        className="relative w-[26%] min-w-[104px] shrink-0 self-stretch bg-[#e5ded4] bg-cover bg-center"
        style={couponImageStyle(image, code)}
      >
        <div className="absolute inset-0 bg-black/[0.03]" />
      </div>
      <div className="relative flex min-w-0 flex-1 items-stretch rounded-r-2xl border border-l-0 border-[#eadfd4] bg-[#fffaf5] sm:min-h-[132px]">
        <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-4 sm:px-6">
          <p className="font-serif-tc text-[19px] font-bold tracking-[0.08em] text-[#2c2826] sm:text-[23px]">{code}</p>
          <p className="mt-1 text-[13px] font-medium text-[#6b6156] sm:text-sm">{desc}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
            {tags.map((t) => (
              <span key={t} className="rounded-md bg-[#f3ede6] px-2 py-0.5 text-[10px] text-[#8a7f72] sm:px-3 sm:py-1 sm:text-xs">{t}</span>
            ))}
          </div>
        </div>
        {divided ? (
          <div className="relative flex w-[26%] min-w-[76px] shrink-0 items-center justify-center self-stretch overflow-hidden px-2 sm:w-[28%] sm:min-w-[112px] sm:px-4">
            {action}
          </div>
        ) : (
          <div className="relative flex w-[26%] min-w-[76px] shrink-0 flex-col items-center justify-center gap-2 overflow-hidden px-2 py-3 sm:w-[28%] sm:min-w-[112px] sm:px-4">
            {action}
            {showScript ? (
              <p className="font-script hidden text-center text-[15px] leading-[1.15] text-[#c2b3a0] sm:block">{couponScript(code)}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 訂單紀錄(列表) ---------- */
function OrdersTab({
  orders,
  imageByName,
  onOpen,
  onCancel,
  onPay,
}: {
  orders: Order[];
  imageByName: Map<string, string>;
  onOpen: (o: Order) => void;
  onCancel: (o: Order) => void;
  onPay: (o: Order) => void;
}) {
  const [tab, setTab] = useState<OrderTab>('all');
  if (orders.length === 0) {
    return (
      <p className="rounded-2xl border border-[#e5ded4] bg-white p-8 text-center text-[#6b6156]">
        你還沒有訂單。
        <Link href="/" className="font-semibold text-[#c84767]">
          去逛逛 →
        </Link>
      </p>
    );
  }
  const shown = tab === 'all' ? orders : orders.filter((o) => orderTabOf(o) === tab);
  const actionBtn = 'inline-flex h-8 items-center rounded-full border border-[#d7c9bd] px-4 text-xs font-semibold text-[#6b6156] hover:bg-[#efe8dd]';
  const payBtn = 'inline-flex h-8 items-center rounded-full bg-[#ada265] px-4 text-xs font-semibold text-white hover:bg-[#9a9059]';
  return (
    <div className="space-y-4">
      {/* 分頁(底線式,可左右滑動) */}
      <div className="-mx-4 overflow-x-auto overflow-y-hidden border-b border-[#e5ded4] px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-6">
          {ORDER_TABS.map((t) => {
            const inTab = t.key === 'all' ? orders : orders.filter((o) => orderTabOf(o) === t.key);
            const n = inTab.length;
            const attention = inTab.some((o) => orderNeedsAttention(o, 'customer'));
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative -mb-px shrink-0 border-b-2 pb-2 pt-1 text-center transition ${
                  active ? 'border-[#1f1b19]' : 'border-transparent'
                }`}
              >
                {attention ? <AttentionDot className="absolute right-0 top-0" /> : null}
                <span className={`block text-sm font-semibold ${active ? 'text-[#1f1b19]' : 'text-[#8a7f72]'}`}>{t.label}</span>
                <span className={`block text-sm ${active ? 'font-semibold text-[#1f1b19]' : 'text-[#a99e8f]'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-[#e5ded4] bg-white p-8 text-center text-[#6b6156]">此分類目前沒有訂單。</p>
      ) : (
        <div className="space-y-3">
          {shown.map((order) => {
            const shipped = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(order.fulfillment_status ?? '');
            return (
              <div
                key={order.id}
                className="block w-full rounded-xl border border-[#e5ded4] bg-white p-5 text-left transition hover:border-[#c9b8a8] hover:shadow-sm"
              >
                <button onClick={() => onOpen(order)} className="block w-full text-left">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 font-semibold">
                        {orderNeedsAttention(order, 'customer') ? <AttentionDot /> : null}
                        {order.order_no}
                      </p>
                      <p className="text-sm text-[#8a7f72]">
                        {order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : ''} ·{' '}
                        {order.items.reduce((n, it) => n + it.quantity, 0)} 件
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <OrderStatusBadge order={order} />
                      <span className="font-semibold">{formatter.format(order.total)}</span>
                      <span className="text-[#c9b8a8]">›</span>
                    </div>
                  </div>

                  {order.cancel_status && order.cancel_status !== '' ? (
                    <p className="mt-2 text-xs font-semibold text-[#c0392b]">
                      {CANCEL_STATUS_LABEL[order.cancel_status] ?? ''}
                    </p>
                  ) : null}

                  {/* 所有商品縮圖 */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.items.map((it, i) => (
                      <div
                        key={i}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[#eee5da] bg-[#e9e1d6]"
                      >
                        {it.image || imageByName.get(it.name) ? (
                          <img
                            src={it.image || imageByName.get(it.name)}
                            alt={it.name}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                        {it.quantity > 1 && (
                          <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/60 px-1 text-[10px] font-semibold text-white">
                            ×{it.quantity}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </button>

                {/* 依狀態顯示操作 */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#f1ebe1] pt-3">
                  {canPayNow(order) ? (
                    isOnlinePayment(order.payment_method ?? '') ? (
                      <a href={`/api/payment/newebpay/checkout?order=${encodeURIComponent(order.order_no)}`} className={payBtn}>
                        立即付款
                      </a>
                    ) : (
                      <button onClick={() => onPay(order)} className={payBtn}>
                        立即付款
                      </button>
                    )
                  ) : null}
                  {shipped ? (
                    <button onClick={() => onOpen(order)} className={actionBtn}>查看物流</button>
                  ) : null}
                  {canRequestCancel(order) ? (
                    <button onClick={() => onCancel(order)} className={actionBtn}>申請取消</button>
                  ) : null}
                  <button onClick={() => onOpen(order)} className={actionBtn}>訂單詳情</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- 訂單完整資訊(懸浮視窗) ---------- */
const SHIPPING_NOTE =
  '本網站商品採預購,備貨約 5–14 天(不含假日)。實際運費與到貨時間以出貨通知為準;偏遠、困難點或轉外車聯運費另計。';
const PAYMENT_NOTE =
  '請留意收件人姓名、電話、地址正確。取貨付款於取貨時付款;轉帳匯款請於下單後完成並私訊通知。提供 7 天鑑賞期(不含拆封使用)。';

function OrderModal({
  order,
  imageByName,
  returnInfo,
  onClose,
  onReorder,
  onCancel,
  onPay,
  onOrderChange,
}: {
  order: Order;
  imageByName: Map<string, string>;
  returnInfo: string;
  onClose: () => void;
  onReorder: () => void;
  onCancel: (o: Order) => void;
  onPay: (o: Order) => void;
  onOrderChange: (o: Order) => void;
}) {
  const dateStr = order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : '';
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [showReturn, setShowReturn] = useState(false);
  const [shipForm, setShipForm] = useState({ carrier: '', tracking: '' });
  const [shipBusy, setShipBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const hasActiveReturn = returns.some((r) => r.status !== 'REJECTED');

  useEffect(() => {
    fetch(`/api/orders/${order.id}/history`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: OrderStatusHistory[]) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [order.id]);

  const loadReturns = useCallback(() => {
    fetch(`/api/orders/${order.id}/returns`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ReturnRequest[]) => setReturns(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [order.id]);
  useEffect(() => { loadReturns(); }, [loadReturns]);

  async function markShipped(returnId: string) {
    if (shipBusy || (!shipForm.carrier.trim() && !shipForm.tracking.trim())) return;
    setShipBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/returns`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: returnId, action: 'shipped', return_carrier: shipForm.carrier.trim(), return_tracking: shipForm.tracking.trim() }),
      });
      if (!res.ok) { void uiAlert((await res.json()).error ?? '回報失敗'); return; }
      setShipForm({ carrier: '', tracking: '' });
      loadReturns();
      void uiAlert('已回報寄件,賣家收到退貨後會為你處理退款。');
    } finally { setShipBusy(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e5ded4] bg-white px-5 py-4">
          <h2 className="text-lg font-semibold">合計：{formatter.format(order.total)}</h2>
          <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 text-2xl leading-none hover:bg-[#efe8dd]">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
          {/* 訂單進度(下方中央小字可展開狀態更新紀錄) */}
          <OrderProgress order={order} onShowHistory={history.length > 0 ? () => setHistoryOpen(true) : undefined} />

          {/* 品項(含縮圖、原價劃線) */}
          <div className="space-y-3">
            {order.items.map((it, i) => {
              const img = it.image || imageByName.get(it.name) || '';
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#e9e1d6]">
                    {img ? <img src={img} alt={it.name} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-[#8a7f72]">{it.variant}</p>
                    <p className="text-xs text-[#8a7f72]">數量：{it.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatter.format(it.price * it.quantity)}</p>
                    {it.original_price && it.original_price > it.price ? (
                      <p className="text-xs text-[#b3a897] line-through">
                        {formatter.format(it.original_price * it.quantity)}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 金額 */}
          <div className="space-y-1.5 border-t border-[#efe8dd] pt-4 text-sm">
            <Row label="小計" value={formatter.format(order.subtotal)} />
            <Row label="運費" value={order.shipping === 0 ? '免運' : formatter.format(order.shipping)} />
            {order.discount > 0 && (
              <Row label={`折扣 ${order.discount_code || ''}`} value={`-${formatter.format(order.discount)}`} />
            )}
            {order.point_discount && order.point_discount > 0 ? (
              <Row label="點數折抵" value={`-${formatter.format(order.point_discount)}`} />
            ) : null}
            <div className="flex justify-between pt-1 text-base font-semibold">
              <span>合計（{order.items.reduce((n, it) => n + it.quantity, 0)} 件）</span>
              <span className="text-[#c84767]">{formatter.format(order.total)}</span>
            </div>
            {order.refund_amount && order.refund_amount > 0 ? (
              <Row label="已退款" value={`-${formatter.format(order.refund_amount)}`} />
            ) : null}
          </div>

          {/* 取消申請狀態 */}
          {order.cancel_status && order.cancel_status !== '' ? (
            <div className="rounded-xl border border-[#e8d6d0] bg-[#fbf3f0] p-4">
              <p className="text-sm font-semibold text-[#c0392b]">{CANCEL_STATUS_LABEL[order.cancel_status] ?? ''}</p>
              {order.cancel_reason ? <p className="mt-1 text-xs text-[#8a7f72]">你的原因：{order.cancel_reason}</p> : null}
              {order.cancel_response ? <p className="mt-1 text-xs text-[#6b6156]">賣家回覆：{order.cancel_response}</p> : null}
            </div>
          ) : null}

          {/* 操作 */}
          {canPayNow(order) && !order.paid && order.created_at ? (
            <p className="mb-2 text-sm text-[#c0392b]">
              請於 {paymentDeadline(order.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 前完成付款,逾期將自動取消訂單。
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canPayNow(order) ? (
              isOnlinePayment(order.payment_method ?? '') ? (
                <a
                  href={`/api/payment/newebpay/checkout?order=${encodeURIComponent(order.order_no)}`}
                  className="inline-flex h-9 items-center rounded-full bg-[#ada265] px-4 text-sm font-semibold text-white transition hover:bg-[#9a9059]"
                >
                  立即付款
                </a>
              ) : (
                <button
                  onClick={() => onPay(order)}
                  className="inline-flex h-9 items-center rounded-full bg-[#ada265] px-4 text-sm font-semibold text-white transition hover:bg-[#9a9059]"
                >
                  立即付款 / 回報匯款
                </button>
              )
            ) : null}
            <button
              onClick={onReorder}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#d7c9bd] px-4 text-sm font-semibold text-[#6b6156] transition hover:bg-[#efe8dd]"
            >
              <IconCart /> 再次加入購物車
            </button>
            {canRequestCancel(order) ? (
              <button
                onClick={() => onCancel(order)}
                className="inline-flex h-9 items-center rounded-full border border-[#d7c9bd] px-4 text-sm font-semibold text-[#6b6156] transition hover:bg-[#efe8dd]"
              >
                申請取消
              </button>
            ) : null}
            {canRequestReturn(order) && !hasActiveReturn ? (
              <button
                onClick={() => setShowReturn(true)}
                className="inline-flex h-9 items-center rounded-full border border-[#d7c9bd] px-4 text-sm font-semibold text-[#6b6156] transition hover:bg-[#efe8dd]"
              >
                申請退貨
              </button>
            ) : null}
          </div>

          {/* 退貨紀錄 */}
          {returns.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-[#e5ded4] bg-[#faf7f2] p-4">
              <p className="text-sm font-semibold">退貨紀錄</p>
              {returns.map((r) => (
                <div key={r.id} className="rounded-lg bg-white p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.return_no}</span>
                    <span className="font-semibold text-[#c0392b]">{RETURN_STATUS_LABEL[r.status] ?? r.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8a7f72]">
                    {r.items.map((it) => `${it.name}${it.variant ? `(${it.variant})` : ''}×${it.quantity}`).join('、')}
                  </p>
                  <p className="mt-0.5 text-xs text-[#6b6156]">退款金額 {formatter.format(r.refund_amount)}</p>
                  {r.response ? <p className="mt-0.5 text-xs text-[#6b6156]">賣家回覆：{r.response}</p> : null}
                  {r.return_tracking || r.return_carrier ? (
                    <p className="mt-0.5 text-xs text-[#6b6156]">寄回物流：{r.return_carrier} {r.return_tracking}</p>
                  ) : null}
                  {r.status === 'APPROVED' && returnInfo ? (
                    <div className="mt-2 rounded-lg bg-[#faf6ea] p-2 text-xs">
                      <p className="font-semibold text-[#8a6d1b]">退貨寄回資訊</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[#6b6156]">{returnInfo}</p>
                    </div>
                  ) : null}
                  {r.status === 'APPROVED' ? (
                    <div className="mt-2 rounded-lg border border-[#e5ded4] p-2">
                      <p className="mb-1 text-xs font-semibold text-[#6b6156]">寄回後請回報物流</p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={shipForm.carrier}
                          onChange={(e) => setShipForm({ ...shipForm, carrier: e.target.value })}
                          placeholder="物流公司(例:黑貓)"
                          className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-2 py-1.5 text-xs"
                        />
                        <input
                          value={shipForm.tracking}
                          onChange={(e) => setShipForm({ ...shipForm, tracking: e.target.value })}
                          placeholder="物流單號"
                          className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-2 py-1.5 text-xs"
                        />
                        <button
                          onClick={() => markShipped(r.id)}
                          disabled={shipBusy}
                          className="rounded-full bg-[#1f1b19] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          已寄回退貨商品
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* 訂單資訊 */}
          <Section title="訂單資訊">
            <Row label="訂單號碼" value={order.order_no} />
            <Row label="訂單電郵" value={order.email} />
            <Row label="訂單日期" value={dateStr} />
            <Row label="訂單狀態" value={order.status} />
            {order.note ? <Row label="備註" value={order.note} /> : null}
          </Section>

          {/* 送貨資訊 */}
          <Section title="送貨資訊">
            <Row label="收件人名稱" value={order.customer_name} />
            {order.phone ? <Row label="收件人電話" value={order.phone} /> : null}
            {order.shipping_method ? <Row label="送貨方式" value={order.shipping_method} /> : null}
            {order.address ? <Row label="地址" value={order.address} /> : null}
            <p className="pt-1 text-xs leading-5 text-[#8a7f72]">送貨方式簡介：{SHIPPING_NOTE}</p>
          </Section>

          {/* 付款資訊 */}
          <Section title="付款資訊">
            {order.payment_method ? <Row label="付款方式" value={order.payment_method} /> : null}
            <Row label="付款狀態" value={order.paid ? '已付款' : '未付款'} />
            {order.payment_ref ? <Row label="回報後五碼" value={order.payment_ref} /> : null}
            {order.payment_proof_url ? (
              <div className="flex justify-between gap-3">
                <span className="shrink-0 text-[#8a7f72]">付款截圖</span>
                <a href={order.payment_proof_url} target="_blank" rel="noreferrer" className="font-semibold text-[#c84767] underline">已上傳</a>
              </div>
            ) : null}
            <p className="pt-1 text-xs leading-5 text-[#8a7f72]">付款指示：{PAYMENT_NOTE}</p>
          </Section>
        </div>
      </div>

      {showReturn ? (
        <ReturnRequestModal
          order={order}
          returnInfo={returnInfo}
          onClose={() => setShowReturn(false)}
          onDone={() => {
            setShowReturn(false);
            loadReturns();
            onOrderChange({ ...order, status: '退貨', fulfillment_status: 'RETURNING' });
            void uiAlert('已送出退貨申請，賣家將盡快為你處理。');
          }}
        />
      ) : null}

      {/* 訂單狀態更新紀錄(浮層,最上層,不推擠頁面) */}
      {historyOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#e5ded4] px-5 py-4">
              <h3 className="text-base font-semibold">訂單狀態更新紀錄</h3>
              <button onClick={() => setHistoryOpen(false)} aria-label="關閉" className="rounded-md p-1 hover:bg-[#efe8dd]">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-5">
              {history.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#8a7f72]">目前沒有狀態更新紀錄。</p>
              ) : (
                <ol className="relative space-y-4 border-l border-[#e5ded4] pl-5">
                  {history.map((h) => {
                    const tone = h.type === 'payment' ? '#2b5fa5' : h.type === 'fulfillment' ? '#1f7a44' : '#ada265';
                    const typeLabel = h.type === 'payment' ? '付款' : h.type === 'fulfillment' ? '物流' : '訂單';
                    return (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-2 ring-white" style={{ background: tone }} />
                        <div className="flex items-center gap-2">
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${tone}1a`, color: tone }}>{typeLabel}</span>
                          <span className="text-sm font-medium text-[#2c2826]">{h.note || h.to_status || '狀態更新'}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#8a7f72]">{new Date(h.created_at).toLocaleString('zh-TW')}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const CANCEL_REASONS = ['購買錯商品，需重新下單', '不想買了', '想修改訂單', '其他'];
const RETURN_REASONS = ['尺寸不合', '商品瑕疵', '與描述不符', '不想要了', '其他'];

function ReturnRequestModal({ order, returnInfo, onClose, onDone }: { order: Order; returnInfo: string; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function toggle(idx: number, max: number, on: boolean) {
    setPicked((p) => {
      const next = { ...p };
      if (on) next[idx] = Math.min(max, p[idx] || 1);
      else delete next[idx];
      return next;
    });
  }
  function setQty(idx: number, qty: number, max: number) {
    setPicked((p) => ({ ...p, [idx]: Math.max(1, Math.min(max, qty)) }));
  }

  const refundAmount = order.items.reduce((sum, it, i) => (picked[i] ? sum + it.price * picked[i] : sum), 0);

  async function submit() {
    setErr('');
    const items = Object.entries(picked).map(([i, q]) => ({ index: Number(i), quantity: q }));
    if (items.length === 0) { setErr('請至少選擇一項要退貨的商品'); return; }
    const finalReason = reason === '其他' ? other.trim() : reason;
    if (!finalReason) { setErr('請選擇或填寫退貨原因'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finalReason, items: items.map((it) => ({ ...it, reason: finalReason })) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? '申請失敗'); return; }
      onDone();
    } catch {
      setErr('申請失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="申請退貨" onClose={onClose}>
      <p className="mb-3 text-sm text-[#8a7f72]">訂單 {order.order_no}，勾選要退貨的商品與數量。</p>
      <div className="space-y-2">
        {order.items.map((it, i) => {
          const on = picked[i] != null;
          return (
            <div key={i} className={`rounded-lg border p-3 ${on ? 'border-[#1f1b19] bg-[#faf7f2]' : 'border-[#e5ded4]'}`}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={on} onChange={(e) => toggle(i, it.quantity, e.target.checked)} className="h-4 w-4" />
                <span className="flex-1 text-sm font-medium">{it.name}<span className="ml-1 text-xs text-[#8a7f72]">{it.variant}</span></span>
                <span className="text-sm">{formatter.format(it.price)}</span>
              </label>
              {on ? (
                <div className="mt-2 flex items-center gap-2 pl-6 text-sm">
                  <span className="text-[#8a7f72]">退貨數量</span>
                  <div className="inline-flex items-center rounded-full border border-[#e5ded4]">
                    <button type="button" className="px-2.5 py-0.5" onClick={() => setQty(i, (picked[i] || 1) - 1, it.quantity)}>-</button>
                    <span className="w-8 text-center">{picked[i]}</span>
                    <button type="button" className="px-2.5 py-0.5" onClick={() => setQty(i, (picked[i] || 1) + 1, it.quantity)}>+</button>
                  </div>
                  <span className="text-xs text-[#a99e8f]">/ {it.quantity}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm text-[#8a7f72]">退貨原因</span>
        <select value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5">
          <option value="">請選擇退貨原因…</option>
          {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {reason === '其他' ? (
        <textarea value={other} onChange={(e) => setOther(e.target.value)} rows={2} placeholder="請輸入退貨原因" className="mt-2 w-full rounded-lg border border-[#e5ded4] px-3 py-2.5 text-sm" />
      ) : null}

      <div className="mt-3 flex justify-between text-sm">
        <span className="text-[#8a7f72]">預估退款金額</span>
        <span className="font-semibold text-[#c84767]">{formatter.format(refundAmount)}</span>
      </div>

      {returnInfo ? (
        <div className="mt-3 rounded-lg border border-[#d8c7a8] bg-[#faf6ea] p-3">
          <p className="text-sm font-semibold text-[#8a6d1b]">退貨寄回資訊</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[#6b6156]">{returnInfo}</p>
          <p className="mt-1 text-xs text-[#a99e8f]">賣家核准後請依此資訊將商品寄回。</p>
        </div>
      ) : null}

      {err ? <p className="mt-2 text-sm text-[#c0392b]">{err}</p> : null}
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-full border border-[#d7c9bd] px-4 py-3 font-semibold text-[#6b6156] hover:bg-[#efe8dd]">先不要</button>
        <button onClick={submit} disabled={busy} className="flex-1 rounded-full bg-[#c84767] px-4 py-3 font-semibold text-white disabled:opacity-60">送出退貨申請</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#e5ded4] px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 text-2xl leading-none hover:bg-[#efe8dd]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>
  );
}

function CancelRequestModal({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (o: Order) => void }) {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (!reason) { setErr('請選擇取消原因'); return; }
    const finalReason = reason === '其他' ? other.trim() : reason;
    if (reason === '其他' && !finalReason) { setErr('請輸入取消原因'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finalReason }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? '申請失敗'); return; }
      onDone(data as Order);
    } catch {
      setErr('申請失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="申請取消訂單" onClose={onClose}>
      <p className="mb-3 text-sm text-[#8a7f72]">訂單 {order.order_no}，送出後由賣家審核。</p>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-[#8a7f72]">取消原因</span>
        <select
          value={reason}
          onChange={(e) => { setReason(e.target.value); setErr(''); }}
          className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5"
        >
          <option value="">請選擇取消原因…</option>
          {CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {reason === '其他' ? (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value)}
          rows={3}
          placeholder="請輸入取消原因"
          className="mb-3 w-full rounded-lg border border-[#e5ded4] px-3 py-2.5 text-sm"
        />
      ) : null}
      {err ? <p className="mb-3 text-sm text-[#c0392b]">{err}</p> : null}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-full border border-[#d7c9bd] px-4 py-3 font-semibold text-[#6b6156] hover:bg-[#efe8dd]">先不要</button>
        <button onClick={submit} disabled={busy} className="flex-1 rounded-full bg-[#c84767] px-4 py-3 font-semibold text-white disabled:opacity-60">送出申請</button>
      </div>
    </ModalShell>
  );
}

function PayTransferModal({ order, account, onClose, onDone }: { order: Order; account: { name: string; info: string } | null; onClose: () => void; onDone: (o: Order) => void }) {
  const [last5, setLast5] = useState(order.payment_ref ?? '');
  const [note, setNote] = useState(order.payment_proof_note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (!last5.trim() && !file) { setErr('請輸入帳號後五碼，或選擇上傳截圖'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('last5', last5.trim());
      fd.append('note', note.trim());
      if (file) fd.append('file', file);
      const res = await fetch(`/api/orders/${order.id}/payment-proof`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? '送出失敗'); return; }
      onDone(data as Order);
    } catch {
      setErr('送出失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="匯款資訊與回報" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-[#faf7f2] p-4 text-sm">
          <div className="flex justify-between"><span className="text-[#8a7f72]">訂單號碼</span><span className="font-medium">{order.order_no}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-[#8a7f72]">應付金額</span><span className="font-semibold text-[#c84767]">{formatter.format(order.total)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-[#8a7f72]">付款方式</span><span>{order.payment_method}</span></div>
        </div>

        {account ? (
          <div className="rounded-xl border border-[#d8c7a8] bg-[#faf6ea] p-4">
            <p className="text-sm font-semibold text-[#8a6d1b]">{account.name} — 收款帳號</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#6b6156]">{account.info}</p>
          </div>
        ) : (
          <p className="text-sm text-[#8a7f72]">請聯繫賣家取得匯款帳號。</p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold">完成匯款後回報,方便賣家對帳</p>
          <input
            value={last5}
            onChange={(e) => setLast5(e.target.value)}
            inputMode="numeric"
            maxLength={20}
            placeholder="轉出帳號後五碼"
            className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5 text-sm"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-[#6b6156] file:mr-3 file:rounded-full file:border-0 file:bg-[#efe8dd] file:px-4 file:py-2 file:text-sm file:font-semibold"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="補充說明(選填,例:匯款時間)"
            className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5 text-sm"
          />
        </div>

        {order.payment_proof_url ? (
          <p className="text-xs text-[#1f7a44]">已上傳截圖，可再上傳覆蓋。</p>
        ) : null}
        {err ? <p className="text-sm text-[#c0392b]">{err}</p> : null}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-[#d7c9bd] px-4 py-3 font-semibold text-[#6b6156] hover:bg-[#efe8dd]">關閉</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-full bg-[#c84767] px-4 py-3 font-semibold text-white disabled:opacity-60">送出回報</button>
        </div>
      </div>
    </ModalShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-[#efe8dd] pt-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <div className="space-y-1.5 text-sm text-[#6b6156]">{children}</div>
    </div>
  );
}

function OrderProgress({ order, onShowHistory }: { order: Order; onShowHistory?: () => void }) {
  const steps = buildProgress(order);
  const cancelled = order.status === '取消';
  return (
    <div className="rounded-xl bg-[#faf7f2] p-4 pb-2">
      <div className="flex items-start">
        {steps.map((s, i) => {
          const active = s.done || s.current;
          const color = cancelled ? '#c0392b' : active ? '#ada265' : '#d7c9bd';
          return (
            <div key={s.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : ''}`} style={{ background: active ? color : '#e5ded4' }} />
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: color }}
                >
                  {s.done ? (
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  ) : null}
                </div>
                <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : ''}`} style={{ background: steps[i + 1]?.done || steps[i + 1]?.current ? color : '#e5ded4' }} />
              </div>
              <span className={`mt-1.5 text-center text-[11px] ${active ? 'font-semibold text-[#6b6156]' : 'text-[#a99e8f]'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      {onShowHistory ? (
        <div className="mt-2 text-center">
          <button
            onClick={onShowHistory}
            className="inline-flex items-center gap-0.5 text-[11px] text-[#a99e8f] underline-offset-2 hover:text-[#6b6156] hover:underline"
          >
            展開
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.2L21 7H5.2" />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-[#8a7f72]">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  );
}

/* ---------- 追蹤清單 ---------- */
function FavoritesTab({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <p className="rounded-2xl border border-[#e5ded4] bg-white p-8 text-center text-[#6b6156]">
        還沒有收藏商品。到商品頁點星號即可加入追蹤清單。
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {products.map((p) => (
        <Link
          key={p.id}
          href={`/products/${encodeURIComponent(p.id)}`}
          className="group overflow-hidden rounded-xl border border-[#e5ded4] bg-white"
        >
          <div className="aspect-square overflow-hidden bg-[#e9e1d6]">
            {p.image ? (
              <img
                src={p.image}
                alt={p.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : null}
          </div>
          <div className="p-3">
            <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
            <p className="mt-1 text-sm font-semibold text-[#c84767]">{formatter.format(p.price)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
