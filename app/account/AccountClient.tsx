'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Discount, Order, Product, UserCoupon } from '@/lib/types';

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
  const base = d.type === 'percent' ? `${d.value}% 折扣` : `折抵 ${formatter.format(d.value)}`;
  return d.min_spend > 0 ? `${base}(滿 ${formatter.format(d.min_spend)})` : base;
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
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('profile');
  const [openOrder, setOpenOrder] = useState<Order | null>(null);

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

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.refresh();
  }

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
      alert('這筆訂單的商品目前已無法加入購物車。');
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
      <header className="border-b border-[#e5ded4] bg-[#faf7f2]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#8a7f72]">會員中心</p>
            <p className="mt-0.5 font-medium">{userName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-[#e5ded4] bg-white px-4 py-2 text-sm font-medium text-[#6b6156] hover:bg-[#efe8dd]"
            >
              繼續購物
            </Link>
            <button
              onClick={signOut}
              className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      {/* 分頁列 */}
      <div className="border-b border-[#e5ded4] bg-[#faf7f2]">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 sm:px-6">
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
            name={userName}
            email={userEmail}
            phone={userPhone}
            address={userAddress}
            provider={provider}
            onSaved={() => router.refresh()}
          />
        )}

        {tab === 'coupons' && <CouponsTab coupons={coupons} />}

        {tab === 'orders' && (
          <OrdersTab orders={orders} imageByName={imageByName} onOpen={setOpenOrder} />
        )}

        {tab === 'favorites' && <FavoritesTab products={favoriteProducts} />}
      </section>

      {openOrder && (
        <OrderModal
          order={openOrder}
          imageByName={imageByName}
          onClose={() => setOpenOrder(null)}
          onReorder={() => reorder(openOrder)}
        />
      )}
    </main>
  );
}

/* ---------- 個人資訊 ---------- */
function ProfileTab({
  name,
  email,
  phone,
  address,
  provider,
  onSaved,
}: {
  name: string;
  email: string;
  phone: string;
  address: string;
  provider: string;
  onSaved: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(phone);
  const [draftAddress, setDraftAddress] = useState(address);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const dirty = draftName !== name || draftPhone !== phone || draftAddress !== address;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, phone: draftPhone, address: draftAddress }),
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

  return (
    <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
      <h2 className="text-lg font-semibold">會員資料</h2>
      <div className="mt-5 grid gap-4">
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">姓名</span>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">電郵</span>
          <input
            value={email}
            disabled
            className="w-full rounded-lg border border-[#e5ded4] bg-[#f6f2ec] px-3 py-2.5 text-[#8a7f72]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">手機號碼</span>
          <input
            value={draftPhone}
            onChange={(e) => setDraftPhone(e.target.value)}
            placeholder="09xxxxxxxx 或 +8869xxxxxxxx"
            className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">常用地址</span>
          <textarea
            value={draftAddress}
            onChange={(e) => setDraftAddress(e.target.value)}
            placeholder="收件地址或常用門市"
            rows={3}
            className="w-full rounded-lg border border-[#e5ded4] px-3 py-2.5"
          />
        </label>
        <div>
          <span className="mb-1 block text-sm text-[#8a7f72]">註冊方式</span>
          <span className="inline-block rounded-full bg-[#f3ede4] px-3 py-1 text-sm font-medium capitalize text-[#6b6156]">
            {provider}
          </span>
        </div>
      </div>

      {msg && (
        <p
          className={`mt-4 rounded-lg px-4 py-2 text-sm ${
            msg.type === 'ok' ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdecec] text-[#c0392b]'
          }`}
        >
          {msg.text}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="mt-6 rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {saving ? '儲存中…' : '儲存變更'}
      </button>
    </div>
  );
}

/* ---------- 優惠券及購物金 ---------- */
function CouponsTab({ coupons }: { coupons: Discount[] }) {
  const [owned, setOwned] = useState<UserCoupon[]>([]);
  const [claimable, setClaimable] = useState<Discount[]>(coupons);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);

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
    if (!res.ok) return alert(data?.error ?? '領取失敗');
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
        <h2 className="text-lg font-semibold">我的優惠券</h2>
        {!ready && (
          <p className="mt-3 rounded-lg bg-[#fff8e8] px-4 py-3 text-sm text-[#8a6d2f]">
            會員領券資料表尚未建立,目前先顯示可輸入的優惠碼。
          </p>
        )}
        {loading ? (
          <p className="mt-4 rounded-lg bg-[#f6f2ec] p-5 text-sm text-[#6b6156]">載入優惠券中...</p>
        ) : owned.length === 0 ? (
          <p className="mt-4 rounded-lg bg-[#f6f2ec] p-5 text-sm text-[#6b6156]">目前沒有可用的優惠券。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {owned.map((item) => {
              const c = item.coupon;
              if (!c) return null;
              return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#d7c9bd] bg-[#faf7f2] p-4"
              >
                <div>
                  <p className="text-xs font-semibold text-[#8a7f72]">{item.status === 'used' ? '已使用' : '可使用'}</p>
                  <p className="font-mono text-lg font-bold tracking-wide">{c.code}</p>
                  <p className="text-sm text-[#8a7f72]">{couponLabel(c)}</p>
                </div>
                <span className="rounded-full bg-[#1f1b19] px-3 py-1 text-xs font-semibold text-white">
                  結帳輸入
                </span>
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
}: {
  orders: Order[];
  imageByName: Map<string, string>;
  onOpen: (o: Order) => void;
}) {
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
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <button
          key={order.id}
          onClick={() => onOpen(order)}
          className="block w-full rounded-xl border border-[#e5ded4] bg-white p-5 text-left transition hover:border-[#c9b8a8] hover:shadow-sm"
        >
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
      ))}
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
  onClose,
  onReorder,
}: {
  order: Order;
  imageByName: Map<string, string>;
  onClose: () => void;
  onReorder: () => void;
}) {
  const dateStr = order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : '';
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
            <div className="flex justify-between pt-1 text-base font-semibold">
              <span>合計（{order.items.reduce((n, it) => n + it.quantity, 0)} 件）</span>
              <span className="text-[#c84767]">{formatter.format(order.total)}</span>
            </div>
          </div>

          <button
            onClick={onReorder}
            className="w-full rounded-full bg-[#ada265] px-5 py-3 font-semibold text-white transition hover:bg-[#9a9059]"
          >
            🛒 再次加入購物車
          </button>

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
            <p className="pt-1 text-xs leading-5 text-[#8a7f72]">付款指示：{PAYMENT_NOTE}</p>
          </Section>
        </div>
      </div>
    </div>
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
