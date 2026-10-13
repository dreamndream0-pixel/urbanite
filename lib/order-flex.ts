// 訂單通知 / 訂單查詢的 LINE Flex 卡片(買家/賣家共用)。依事件套用訂單卡片模板(lib/line-flex-templates):
// 成立 → 訂單成立卡、出貨/到店 → 出貨進度卡、取貨/送達/完成 → 送達卡、退貨/退款/取消 → 退貨進度卡、查詢 → 訂單明細卡。
import type { Order } from '@/lib/types';
import { orderBubble, orderKindOf } from '@/lib/line-flex-templates';

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
};

const dateText = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '');

export function orderFlexMessage({ shopName, title, subtitle, order, link, buttonLabel, extra = [], event }: OrderFlexInput) {
  const { kind, step } = orderKindOf(event);
  const rows: Row[] = [
    ...(kind !== 'created' && order.payment_method ? [] : order.payment_method ? [['付款方式', order.payment_method] as Row] : []),
    ...(order.store_name ? [['取貨門市', order.store_name] as Row] : kind === 'created' && order.shipping_method ? [['配送方式', order.shipping_method] as Row] : []),
    ...extra,
  ];
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
    link,
    homeLink,
    buttonLabel,
  }, event === 'cancelled' ? '#8a7f72' : undefined, event);
  return { type: 'flex' as const, altText: `【${shopName}】${title} ${order.order_no}`.slice(0, 300), contents };
}
