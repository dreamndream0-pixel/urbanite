'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Customer, Discount, Order, Product, Recipient, ReturnRequest, SiteSettings, UserCoupon } from '@/lib/types';
import { TW_CITIES, TW_REGIONS } from '@/lib/tw-regions';
import { isOnlinePayment, paymentDeadline } from '@/lib/payment';
import { uiAlert } from '@/lib/ui-dialog';
import AccountMenu from '@/app/components/AccountMenu';
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

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';

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
  const [orderList, setOrderList] = useState<Order[]>(orders);
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [payTarget, setPayTarget] = useState<Order | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<{ name: string; info: string }[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [returnInfo, setReturnInfo] = useState('');
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
      <header className="sticky top-0 z-30 bg-[#faf7f2]/95 backdrop-blur">
        <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6 sm:py-5">
          {/* 左:回首頁 */}
          <div className="flex items-center">
            <Link
              href="/"
              className="rounded-full border border-[#e5ded4] bg-white px-4 py-2 text-sm font-medium text-[#6b6156] hover:bg-[#efe8dd]"
            >
              ← 回首頁
            </Link>
          </div>

          {/* 中:Logo(與首頁一致) */}
          <Link href="/" className="justify-self-center px-2 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt={STORE_NAME} className="mx-auto h-8 w-auto object-contain sm:h-10" />
            ) : (
              <span className="inline-block h-8 w-28 sm:h-10 sm:w-36" aria-hidden />
            )}
          </Link>

          {/* 右:追蹤清單、購物車(中)、我的帳號(最右) */}
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button
              onClick={() => setTab('favorites')}
              aria-label="追蹤清單"
              className="relative rounded-md p-2 hover:bg-[#efe8dd]"
            >
              <IconStar filled={favoriteIds.length > 0} />
              {favoriteIds.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c84767] px-1 text-[10px] font-semibold text-white">
                  {favoriteIds.length}
                </span>
              )}
            </button>
            <Link href="/checkout" aria-label="購物車" className="relative rounded-md p-2 hover:bg-[#efe8dd]">
              <IconBag />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c84767] px-1 text-[10px] font-semibold text-white">
                  {cartCount}
                </span>
              )}
            </Link>
            <AccountMenu />
          </div>
        </nav>
      </header>

      {/* 分頁列 */}
      <div className="border-b border-[#e5ded4] bg-[#faf7f2]">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto overflow-y-hidden px-4 sm:px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${
                tab === t.key
                  ? 'border-[#1f1b19] text-[#1f1b19]'
                  : 'border-transparent text-[#8a7f72] hover:text-[#1f1b19]'
              }`}
            >
              {t.label}
            </button>
          ))}
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

        {tab === 'coupons' && <CouponsTab coupons={coupons} />}

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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function updateRecipient(i: number, patch: Partial<Recipient>) {
    setRecipients((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRecipient() {
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

  const field = 'w-full rounded-lg border border-[#e5ded4] px-3 py-2.5';
  const labelText = 'mb-1 block text-sm text-[#8a7f72]';

  const homeRecipients = recipients.map((r, i) => ({ r, i })).filter(({ r }) => r.type !== 'store');
  const storeRecipients = recipients.map((r, i) => ({ r, i })).filter(({ r }) => r.type === 'store');

  const renderRecipientCard = (r: Recipient, i: number) => (
    <div key={i} className="rounded-xl border border-[#e5ded4] p-4">
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
              <span className="mt-1 block text-xs text-[#a99e8f]">門市請於結帳時重新選擇後「加入常用取貨人」更新。</span>
            </div>
          ) : (
            <label className="mt-3 block">
              <span className={labelText}>詳細地址</span>
              <input value={r.address} onChange={(e) => updateRecipient(i, { address: e.target.value })} placeholder="路 / 街 / 巷弄 / 號 / 樓" className={field} />
            </label>
          )}
          <div className="mt-4 flex items-center gap-4">
            <button type="button" onClick={() => setExpandedRecipient(null)} className="rounded-full bg-[#1f1b19] px-5 py-1.5 text-sm font-semibold text-white">
              完成
            </button>
            <button type="button" onClick={() => removeRecipient(i)} className="text-sm font-semibold text-[#c0392b]">
              刪除此收件人
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">
              {r.name || '(未填姓名)'}
              {r.phone ? <span className="ml-2 text-sm font-normal text-[#8a7f72]">{r.phone}</span> : null}
            </p>
            <p className="mt-1 truncate text-sm text-[#8a7f72]">
              {r.type === 'store'
                ? `超商取貨 · ${r.store_name || r.store_id || '(未設門市)'}`
                : [r.city, r.district, r.address].filter(Boolean).join(' ') || '(未填地址)'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setExpandedRecipient(i)} className="rounded-full border border-[#d7c9bd] px-3 py-1.5 text-sm font-semibold">
              編輯
            </button>
            <button type="button" onClick={() => removeRecipient(i)} className="rounded-full border border-[#e0b4b4] px-3 py-1.5 text-sm font-semibold text-[#c0392b]">
              刪除
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <h2 className="text-lg font-semibold">會員資料</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelText}>姓名</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={labelText}>暱稱</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={labelText}>性別</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={field}>
              <option value="">不透露</option>
              <option value="female">女</option>
              <option value="male">男</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label className="block">
            <span className={labelText}>生日</span>
            <input type="date" value={birthday ?? ''} onChange={(e) => setBirthday(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={labelText}>手機號碼</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" className={field} />
          </label>
          <label className="block">
            <span className={labelText}>Email</span>
            <input value={email} disabled className={field + ' bg-[#f6f2ec] text-[#8a7f72]'} />
          </label>
        </div>
        <p className="mt-3 text-xs text-[#a99e8f]">註冊方式:{provider}</p>
      </div>

      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">常用收件人</h2>
          <button type="button" onClick={addRecipient} className="rounded-full border border-[#d7c9bd] px-4 py-1.5 text-sm font-semibold">
            新增收件人
          </button>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[#6b6156]">宅配到府</h3>
            {homeRecipients.length === 0 ? (
              <p className="text-sm text-[#a99e8f]">尚未設定,點「新增收件人」加入宅配地址。</p>
            ) : (
              <div className="space-y-3">{homeRecipients.map(({ r, i }) => renderRecipientCard(r, i))}</div>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[#6b6156]">超商取貨</h3>
            {storeRecipients.length === 0 ? (
              <p className="text-sm text-[#a99e8f]">結帳選門市後按「加入常用取貨人」即可存到這裡。</p>
            ) : (
              <div className="space-y-3">{storeRecipients.map(({ r, i }) => renderRecipientCard(r, i))}</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <h2 className="text-lg font-semibold">行銷訊息訂閱</h2>
        <div className="mt-4 space-y-3">
          <ToggleRow label="訂閱 Email 電子報" checked={marketing.email} onChange={(v) => setMarketing((m) => ({ ...m, email: v }))} />
          <ToggleRow label="接收簡訊優惠通知" checked={marketing.sms} onChange={(v) => setMarketing((m) => ({ ...m, sms: v }))} />
        </div>
        <h2 className="mt-6 text-lg font-semibold">隱私權設定</h2>
        <div className="mt-4 space-y-3">
          <ToggleRow label="允許依購物紀錄提供個人化推薦" checked={privacy.personalization} onChange={(v) => setPrivacy((p) => ({ ...p, personalization: v }))} />
          <ToggleRow label="公開我的追蹤清單活動" checked={privacy.show_activity} onChange={(v) => setPrivacy((p) => ({ ...p, show_activity: v }))} />
        </div>
      </div>

      {msg && (
        <p className={'rounded-lg px-4 py-2 text-sm ' + (msg.type === 'ok' ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdecec] text-[#c0392b]')}>
          {msg.text}
        </p>
      )}
      <button onClick={save} disabled={saving} className="rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {saving ? '儲存中…' : '儲存變更'}
      </button>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm text-[#3d3935]">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={'relative h-6 w-11 shrink-0 rounded-full transition ' + (checked ? 'bg-[#1f7a44]' : 'bg-[#d7c9bd]')}
      >
        <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white transition ' + (checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

/* ---------- 優惠券及購物金 ---------- */
function CouponsTab({ coupons }: { coupons: Discount[] }) {
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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <h2 className="text-lg font-semibold">購物金</h2>
        <p className="mt-3 text-3xl font-bold text-[#c84767]">{formatter.format(0)}</p>
        <p className="mt-1 text-sm text-[#8a7f72]">目前尚無購物金,消費與活動可累積。</p>
      </div>

      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">我的優惠券</h2>
          <div className="flex rounded-full bg-[#f6f2ec] p-1 text-sm font-semibold">
            {[
              ['available', '可使用'],
              ['used', '已使用'],
              ['expired', '已過期'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCouponTab(key as typeof couponTab)}
                className={`rounded-full px-3 py-1 ${couponTab === key ? 'bg-[#1f1b19] text-white' : 'text-[#8a7f72]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!ready && (
          <p className="mt-3 rounded-lg bg-[#fff8e8] px-4 py-3 text-sm text-[#8a6d2f]">
            會員領券資料表尚未建立,目前先顯示可輸入的優惠碼。
          </p>
        )}
        {loading ? (
          <p className="mt-4 rounded-lg bg-[#f6f2ec] p-5 text-sm text-[#6b6156]">載入優惠券中...</p>
        ) : owned.filter((item) => (couponTab === 'expired' ? ['expired', 'revoked'].includes(item.status) : item.status === couponTab)).length === 0 ? (
          <p className="mt-4 rounded-lg bg-[#f6f2ec] p-5 text-sm text-[#6b6156]">目前沒有可用的優惠券。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {owned.filter((item) => (couponTab === 'expired' ? ['expired', 'revoked'].includes(item.status) : item.status === couponTab)).map((item) => {
              const c = item.coupon;
              if (!c) return null;
              return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#d7c9bd] bg-[#faf7f2] p-4"
              >
                <div>
                  <p className="text-xs font-semibold text-[#8a7f72]">{item.status === 'used' ? '已使用' : item.status === 'revoked' ? '已撤回' : item.status === 'expired' ? '已過期' : '可使用'}</p>
                  <p className="font-mono text-lg font-bold tracking-wide">{c.code}</p>
                  <p className="text-sm text-[#8a7f72]">{couponLabel(c)}</p>
                  <p className="mt-1 text-xs text-[#8a7f72]">
                    {couponScope(c)}
                    {c.end_at ? ` / 到 ${new Date(c.end_at).toLocaleDateString('zh-TW')}` : ' / 無期限'}
                  </p>
                </div>
                {item.status === 'available' && (
                  <span className="rounded-full bg-[#1f1b19] px-3 py-1 text-xs font-semibold text-white">
                    結帳可用
                  </span>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <h2 className="text-lg font-semibold">可領取優惠券</h2>
        {claimable.length === 0 ? (
          <p className="mt-4 rounded-lg bg-[#f6f2ec] p-5 text-sm text-[#6b6156]">目前沒有可領取的優惠券。</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {claimable.map((c) => (
              <div key={c.id} className="rounded-xl border border-[#e5ded4] p-4">
                <p className="font-mono text-lg font-bold tracking-wide">{c.code}</p>
                <p className="mt-1 text-sm text-[#8a7f72]">{couponLabel(c)}</p>
                <p className="mt-1 text-xs text-[#8a7f72]">{couponScope(c)}</p>
                <button
                  type="button"
                  onClick={() => claimCoupon(c.id)}
                  disabled={!ready}
                  className="mt-4 rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  領取
                </button>
              </div>
            ))}
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
  const actionBtn = 'rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs font-semibold text-[#6b6156] hover:bg-[#efe8dd]';
  return (
    <div className="space-y-4">
      {/* 分頁 */}
      <div className="flex flex-wrap gap-2">
        {ORDER_TABS.map((t) => {
          const n = t.key === 'all' ? orders.length : orders.filter((o) => orderTabOf(o) === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                tab === t.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#6b6156] hover:bg-[#efe8dd]'
              }`}
            >
              {t.label}
              <span className={`ml-1 ${tab === t.key ? 'text-white/70' : 'text-[#a99e8f]'}`}>{n}</span>
            </button>
          );
        })}
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
                      <p className="font-semibold">{order.order_no}</p>
                      <p className="text-sm text-[#8a7f72]">
                        {order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : ''} ·{' '}
                        {order.items.reduce((n, it) => n + it.quantity, 0)} 件
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-[#f3ede4] px-3 py-1 text-sm font-semibold text-[#6b6156]">
                        {order.status}
                      </span>
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
                      <a href={`/api/payment/newebpay/checkout?order=${encodeURIComponent(order.order_no)}`} className="rounded-full bg-[#ada265] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9a9059]">
                        立即付款
                      </a>
                    ) : (
                      <button onClick={() => onPay(order)} className="rounded-full bg-[#ada265] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9a9059]">
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
  const hasActiveReturn = returns.some((r) => r.status !== 'REJECTED');

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
          {/* 訂單進度 */}
          <OrderProgress order={order} />

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
            <button
              onClick={onReorder}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#ada265] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9a9059]"
            >
              <IconCart /> 再次加入購物車
            </button>
            {canPayNow(order) ? (
              isOnlinePayment(order.payment_method ?? '') ? (
                <a
                  href={`/api/payment/newebpay/checkout?order=${encodeURIComponent(order.order_no)}`}
                  className="inline-flex items-center rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]"
                >
                  立即付款
                </a>
              ) : (
                <button
                  onClick={() => onPay(order)}
                  className="inline-flex items-center rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]"
                >
                  立即付款 / 回報匯款
                </button>
              )
            ) : null}
            {canRequestCancel(order) ? (
              <button
                onClick={() => onCancel(order)}
                className="inline-flex items-center rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]"
              >
                申請取消
              </button>
            ) : null}
            {canRequestReturn(order) && !hasActiveReturn ? (
              <button
                onClick={() => setShowReturn(true)}
                className="inline-flex items-center rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]"
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

function OrderProgress({ order }: { order: Order }) {
  const steps = buildProgress(order);
  const cancelled = order.status === '取消';
  return (
    <div className="rounded-xl bg-[#faf7f2] p-4">
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

/* ---------- 表頭圖示(與首頁一致) ---------- */
function IconStar({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? '#f5c542' : 'none'} stroke={filled ? '#d89a00' : 'currentColor'} strokeWidth="1.8" strokeLinejoin="round">
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1L12 2Z" />
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
