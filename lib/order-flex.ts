// 訂單通知 / 訂單查詢的 LINE Flex 卡片(買家/賣家共用)。依事件套用訂單卡片模板(lib/line-flex-templates):
// 成立 → 訂單成立卡、出貨/到店 → 出貨進度卡、取貨/送達/完成 → 送達卡、退貨/退款/取消 → 退貨進度卡、查詢 → 訂單明細卡。
import type { Order } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { orderBubble, orderKindOf } from '@/lib/line-flex-templates';
import { FULFILLMENT_STATUS_LABEL } from '@/lib/order-status';

type Row = [string, string];

export type OrderFlexInput = {
  shopName: string;
  title: string; // 例:已出貨
  subtitle?: string; // 標題下的一句說明
  order: Pick<Order, 'order_no' | 'total'> & Partial<Pick<Order, 'items' | 'payment_method' | 'shipping_method' | 'store_name' | 'customer_name' | 'created_at'>>;
  link: string;
  buttonLabel?: string;
  extra?: Row[]; // 例:[['物流單號', 'xxx']]
  event?: string; // 訂單事件(created / shipped / picked_up …);沒有時為訂單明細
  shipment?: { provider?: string | null; shipping_method?: string | null; tracking_number?: string | null; shipped_at?: string | null } | null;
  fulfillmentStatus?: string | null;
};

// 出貨進度:備貨 → 已出貨 → 配送中/到店 → 送達/取貨;退貨、取消不顯示進度
const SHIP_STEP: Record<string, number> = { UNFULFILLED: 0, PREPARING: 0, READY_TO_SHIP: 0, SHIPPED: 1, IN_TRANSIT: 2, AT_STORE: 2, DELIVERED: 3, PICKED_UP: 3 };

const dateText = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '');

export function orderFlexMessage({ shopName, title, subtitle, order, link, buttonLabel, extra = [], event, shipment, fulfillmentStatus }: OrderFlexInput) {
  const { kind, step } = orderKindOf(event);
  const rows: Row[] = [
    ...(kind !== 'created' && order.payment_method ? [] : order.payment_method ? [['付款方式', order.payment_method] as Row] : []),
    ...(order.store_name ? [['取貨門市', order.store_name] as Row] : kind === 'created' && order.shipping_method ? [['配送方式', order.shipping_method] as Row] : []),
    ...extra,
  ];
  const f = fulfillmentStatus ?? '';
  const pickup = Boolean(order.store_name);
  const ship = kind === 'detail' && f in SHIP_STEP ? {
    step: SHIP_STEP[f],
    last: pickup ? '已取貨' : '已送達',
    rows: [
      ['出貨狀態', f === 'AT_STORE' ? '已到店,請盡快取貨' : FULFILLMENT_STATUS_LABEL[f] ?? ''],
      ['物流', shipment?.provider || shipment?.shipping_method || order.shipping_method || ''],
      ['物流單號', shipment?.tracking_number || ''],
      ['出貨日期', dateText(shipment?.shipped_at)],
    ] as Row[],
  } : null;
  let homeLink = link;
  try { homeLink = new URL(link).origin; } catch { /* 保留原連結 */ }
  const contents = orderBubble(kind, {
    shopName,
    title,
    subtitle,
    orderNo: order.order_no,
    total: order.total,
    date: kind === 'detail' || kind === 'return' ? dateText(order.created_at) : '',
    items: (order.items ?? []).map((i) => ({ name: i.name, variant: i.variant, quantity: i.quantity, price: i.price, image: i.image })),
    rows,
    step,
    ship,
    link,
    homeLink,
    buttonLabel,
  }, event === 'cancelled' ? '#8a7f72' : undefined, event);
  return { type: 'flex' as const, altText: `【${shopName}】${title} ${order.order_no}`.slice(0, 300), contents };
}

// 訂單查詢(LINE):最近 5 筆「處理中」的訂單明細卡輪播,含出貨進度、物流與單號。
// 已完成、已取消、已退貨的不顯示;沒有處理中的訂單時回文字訊息。db 需已限定店家(scopedClient)
export async function orderQueryMessage(db: SupabaseClient, userId: string, shopName: string, link: string): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from('orders')
    .select('id, order_no, status, fulfillment_status, total, created_at, items, payment_method, shipping_method, store_name')
    .eq('user_id', userId)
    .or('order_status.is.null,order_status.not.in.(COMPLETED,CANCELLED,CLOSED)')
    .or('fulfillment_status.is.null,fulfillment_status.not.in.(RETURNED)')
    .not('status', 'in', '(取消,已取消,已完成,已退貨)')
    .order('created_at', { ascending: false })
    .limit(5);
  const orders = (data ?? []) as (Order & { fulfillment_status?: string })[];
  if (!orders.length) return { type: 'text', text: `目前沒有處理中的訂單。\n\n查看全部訂單:${link}` };
  const { data: ships } = await db.from('shipments').select('order_id, provider, shipping_method, tracking_number, shipped_at, created_at').in('order_id', orders.map((o) => o.id)).order('created_at', { ascending: false });
  const latest = (id: string) => (ships ?? []).find((x) => x.order_id === id) ?? null;
  const bubbles = orders.map((o) => {
    const f = o.fulfillment_status ?? '';
    const shipped = ['SHIPPED', 'IN_TRANSIT', 'AT_STORE', 'DELIVERED', 'PICKED_UP'].includes(f);
    return orderFlexMessage({
      shopName, order: o, link,
      title: (shipped ? FULFILLMENT_STATUS_LABEL[f] : '') || o.status || '訂單',
      fulfillmentStatus: f, shipment: latest(o.id),
      buttonLabel: '查看訂單',
    }).contents;
  });
  return { type: 'flex', altText: `處理中的訂單 ${orders.length} 筆`, contents: { type: 'carousel', contents: bubbles } };
}
