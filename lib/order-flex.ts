// 訂單通知的 LINE Flex 卡片(買家/賣家共用)。只產生訊息內容,不負責發送。
import type { Order } from '@/lib/types';

const money = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const clip = (v: unknown, max: number) => String(v ?? '').slice(0, max);

type Row = [string, string];

export type OrderFlexInput = {
  shopName: string;
  title: string; // 例:已出貨
  subtitle?: string; // 標題下的一句說明
  order: Pick<Order, 'order_no' | 'total'> & Partial<Pick<Order, 'items' | 'payment_method' | 'shipping_method' | 'store_name' | 'customer_name'>>;
  link: string;
  buttonLabel?: string;
  extra?: Row[]; // 例:[['物流單號', 'xxx']]
  color?: string;
};

function row([label, value]: Row) {
  return {
    type: 'box', layout: 'baseline', spacing: 'md',
    contents: [
      { type: 'text', text: clip(label, 20), size: 'sm', color: '#8a7f72', flex: 3 },
      { type: 'text', text: clip(value, 200) || '-', size: 'sm', color: '#1f1b19', flex: 7, wrap: true },
    ],
  };
}

export function orderFlexMessage({ shopName, title, subtitle, order, link, buttonLabel = '查看訂單', extra = [], color = '#1f1b19' }: OrderFlexInput) {
  const items = (order.items ?? []).slice(0, 3).map((i) => ({
    type: 'box', layout: 'horizontal', spacing: 'sm',
    contents: [
      { type: 'text', text: clip(`${i.name || '商品'}${i.variant ? `(${i.variant})` : ''}`, 80), size: 'xs', color: '#6b6156', flex: 7, wrap: true },
      { type: 'text', text: `× ${i.quantity}`, size: 'xs', color: '#6b6156', flex: 2, align: 'end' },
    ],
  }));
  const more = (order.items?.length ?? 0) - items.length;
  const rows: Row[] = [
    ['訂單編號', order.order_no],
    ['訂單金額', money(order.total)],
    ...(order.payment_method ? [['付款方式', order.payment_method] as Row] : []),
    ...(order.store_name ? [['取貨門市', order.store_name] as Row] : order.shipping_method ? [['配送方式', order.shipping_method] as Row] : []),
    ...extra,
  ];
  const bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: color, spacing: 'xs',
      contents: [
        { type: 'text', text: clip(shopName, 40) || 'URBANITE', size: 'xs', color: '#ffffffb3', weight: 'bold' },
        { type: 'text', text: clip(title, 40), size: 'xl', color: '#ffffff', weight: 'bold', wrap: true },
        ...(subtitle ? [{ type: 'text', text: clip(subtitle, 120), size: 'xs', color: '#ffffffcc', wrap: true }] : []),
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
      contents: [
        ...rows.map(row),
        ...(items.length ? [{ type: 'separator', margin: 'md' }, ...items] : []),
        ...(more > 0 ? [{ type: 'text', text: `等 ${more} 項商品`, size: 'xs', color: '#a99e8f' }] : []),
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [{ type: 'button', style: 'primary', height: 'sm', color, action: { type: 'uri', label: clip(buttonLabel, 20), uri: link } }],
    },
  };
  return { type: 'flex' as const, altText: clip(`【${shopName}】${title} ${order.order_no}`, 300), contents: bubble };
}
