'use client';

import type { PublicOrder } from '@/lib/order-public';

const money = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const SHIP_STATUS: Record<string, string> = { PREPARING: '準備中', READY_TO_SHIP: '待寄出', SHIPPED: '已出貨', IN_TRANSIT: '配送中', AT_STORE: '已到店', DELIVERED: '已送達', PICKED_UP: '已取貨', RETURNED: '已退回' };

// 顧客看的訂單明細(訂單成立頁「展開訂單」、訪客查詢訂單共用)
export default function OrderSummaryView({ order }: { order: PublicOrder }) {
  const date = order.created_at ? new Date(order.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '';
  const status = order.cancel_status === 'REQUESTED' ? '取消申請審核中' : order.status;
  const row = (label: string, value: string) => (value ? <div className="flex justify-between gap-4 py-1"><span className="shrink-0 text-[var(--c-muted)]">{label}</span><span className="min-w-0 text-right">{value}</span></div> : null);
  return (
    <div className="space-y-4 text-left text-sm">
      <div className="flex flex-wrap gap-2">
        {status && status !== '尚未付款' ? <span className="rounded-full bg-[var(--c-soft)] px-3 py-1 text-xs font-semibold">{status}</span> : null}
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.paid ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fff6e5] text-[#9a6412]'}`}>{order.paid ? '已付款' : order.payment_ref ? `已回報匯款(後五碼 ${order.payment_ref})` : '尚未付款'}</span>
      </div>

      <div className="divide-y divide-[var(--c-border)]">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            {it.image ? <img src={it.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-lg bg-[var(--c-soft)]" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{it.name}</p>
              <p className="text-xs text-[var(--c-muted)]">{it.variant || '標準款'} × {it.quantity}</p>
            </div>
            <span className="shrink-0 tabular-nums">{money(it.price * it.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-[var(--c-soft)] px-4 py-3">
        {row('商品小計', money(order.subtotal))}
        {row('運費', order.shipping ? money(order.shipping) : '免運')}
        {order.discount ? row('折扣', `-${money(order.discount)}`) : null}
        {order.credit_used ? row('回饋金折抵', `-${money(order.credit_used)}`) : null}
        <div className="mt-1 flex justify-between border-t border-[var(--c-border)] pt-2 font-semibold"><span>訂單合計</span><span className="tabular-nums">{money(order.total)}</span></div>
      </div>

      <div className="rounded-xl border border-[var(--c-border)] px-4 py-3">
        {row('訂單編號', order.order_no)}
        {row('下單時間', date)}
        {row('付款方式', order.payment_method)}
        {row('配送方式', order.shipping_method)}
        {order.store_name ? row('取貨門市', `${order.store_name}${order.store_id ? `(${order.store_id})` : ''}`) : row('收件地址', order.address)}
        {row('收件人', `${order.customer_name} ${order.phone}`)}
        {order.custom_fields.map((cf) => <div key={cf.id}>{row(cf.label, cf.value)}</div>)}
        {row('備註', order.note)}
      </div>

      {order.shipments.length ? (
        <div className="rounded-xl border border-[var(--c-border)] px-4 py-3">
          <p className="mb-1 font-semibold">物流</p>
          {order.shipments.map((s, i) => <div key={i}>{row(s.carrier || '物流', `${SHIP_STATUS[s.status] ?? s.status}${s.tracking_number ? ` · 單號 ${s.tracking_number}` : ''}`)}</div>)}
        </div>
      ) : null}
    </div>
  );
}
