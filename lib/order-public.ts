// 給顧客看的訂單內容(訂單成立頁「展開訂單」、訪客查詢訂單共用):只放顧客需要的欄位,不含後台備註等
import type { Order, OrderItem } from '@/lib/types';

export type PublicShipment = { carrier: string; tracking_number: string; status: string };
export type PublicOrder = {
  id: string; order_no: string; created_at: string; status: string; paid: boolean; cancel_status: string;
  payment_method: string; shipping_method: string; customer_name: string; phone: string; email: string; address: string;
  store_name: string; store_id: string; store_address: string; note: string; payment_ref: string;
  items: OrderItem[]; subtotal: number; shipping: number; discount: number; credit_used: number; total: number;
  custom_fields: { id: string; label: string; value: string }[]; shipments: PublicShipment[];
};

export function publicOrder(order: Partial<Order> & Record<string, unknown>, shipments: PublicShipment[] = []): PublicOrder {
  const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const n = (v: unknown) => Number(v) || 0;
  return {
    id: s(order.id), order_no: s(order.order_no), created_at: s(order.created_at), status: s(order.status), paid: Boolean(order.paid),
    cancel_status: s(order.cancel_status), payment_method: s(order.payment_method), shipping_method: s(order.shipping_method),
    customer_name: s(order.customer_name), phone: s(order.phone), email: s(order.email), address: s(order.address),
    store_name: s(order.store_name), store_id: s(order.store_id) === 'MANUAL' ? '' : s(order.store_id), store_address: s(order.store_address),
    note: s(order.note), payment_ref: s(order.payment_ref),
    items: Array.isArray(order.items) ? (order.items as OrderItem[]) : [],
    subtotal: n(order.subtotal), shipping: n(order.shipping), discount: n(order.discount), credit_used: n(order.credit_used), total: n(order.total),
    custom_fields: Array.isArray(order.custom_fields) ? order.custom_fields : [],
    shipments,
  };
}
