'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Discount, Order, Product } from '@/lib/types';

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
  provider,
  orders,
  products,
  favoriteIds,
  coupons,
}: {
  userName: string;
  userEmail: string;
  userPhone: string;
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
        <OrderModal order={openOrder} imageByName={imageByName} onClose={() => setOpenOrder(null)} />
      )}
    </main>
  );
}

/* ---------- 個人資訊 ---------- */
function ProfileTab({
  name,
  email,
  phone,
  provider,
  onSaved,
}: {
  name: string;
  email: string;
  phone: string;
  provider: string;
  onSaved: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(phone);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const dirty = draftName !== name || draftPhone !== phone;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, phone: draftPhone }),
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
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <h2 className="text-lg font-semibold">購物金</h2>
        <p className="mt-3 text-3xl font-bold text-[#c84767]">{formatter.format(0)}</p>
        <p className="mt-1 text-sm text-[#8a7f72]">目前尚無購物金,消費與活動可累積。</p>
      </div>

      <div className="rounded-2xl border border-[#e5ded4] bg-white p-6">
        <h2 className="text-lg font-semibold">可用優惠券</h2>
        {coupons.length === 0 ? (
          <p className="mt-4 rounded-lg bg-[#f6f2ec] p-5 text-sm text-[#6b6156]">目前沒有可用的優惠券。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {coupons.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#d7c9bd] bg-[#faf7f2] p-4"
              >
                <div>
                  <p className="font-mono text-lg font-bold tracking-wide">{c.code}</p>
                  <p className="text-sm text-[#8a7f72]">{couponLabel(c)}</p>
                </div>
                <span className="rounded-full bg-[#1f1b19] px-3 py-1 text-xs font-semibold text-white">
                  結帳輸入
                </span>
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
                {imageByName.get(it.name) ? (
                  <img src={imageByName.get(it.name)} alt={it.name} className="h-full w-full object-cover" />
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
function OrderModal({
  order,
  imageByName,
  onClose,
}: {
  order: Order;
  imageByName: Map<string, string>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e5ded4] bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{order.order_no}</h2>
            <p className="text-xs text-[#8a7f72]">
              {order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 text-2xl leading-none hover:bg-[#efe8dd]">
            ×
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#f3ede4] px-3 py-1 text-sm font-semibold text-[#6b6156]">
              {order.status}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                order.paid ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdf3e7] text-[#9a6a1f]'
              }`}
            >
              {order.paid ? '已付款' : '未付款'}
            </span>
          </div>

          {/* 品項(含縮圖) */}
          <div className="space-y-3">
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#e9e1d6]">
                  {imageByName.get(it.name) ? (
                    <img src={imageByName.get(it.name)} alt={it.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="text-xs text-[#8a7f72]">
                    {it.variant} × {it.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold">{formatter.format(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>

          {/* 金額 */}
          <div className="space-y-1.5 border-t border-[#efe8dd] pt-4 text-sm">
            <Row label="小計" value={formatter.format(order.subtotal)} />
            <Row label="運費" value={order.shipping === 0 ? '免運' : formatter.format(order.shipping)} />
            {order.discount > 0 && (
              <Row
                label={`折扣 ${order.discount_code || ''}`}
                value={`-${formatter.format(order.discount)}`}
              />
            )}
            <div className="flex justify-between pt-1 text-base font-semibold">
              <span>合計</span>
              <span className="text-[#c84767]">{formatter.format(order.total)}</span>
            </div>
          </div>

          {/* 收件 / 付款 */}
          <div className="space-y-1.5 border-t border-[#efe8dd] pt-4 text-sm text-[#6b6156]">
            <Row label="收件人" value={order.customer_name} />
            <Row label="Email" value={order.email} />
            {order.shipping_method ? <Row label="送貨方式" value={order.shipping_method} /> : null}
            {order.payment_method ? <Row label="付款方式" value={order.payment_method} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#8a7f72]">{label}</span>
      <span className="text-right">{value}</span>
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
