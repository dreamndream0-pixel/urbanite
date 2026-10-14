// 營收計算(營運總覽、報表共用):只算已付款訂單;總營收含運費,運費另外拉出「代收款(運費)」。
// 退款中屬於運費的部分記在 shipping_refund(退貨 / 標記退款時勾選「退運費」)。
import type { Order } from '@/lib/types';

type RevenueOrder = Pick<Order, 'paid' | 'total' | 'shipping'> & Partial<Pick<Order, 'refund_amount' | 'shipping_discount' | 'shipping_refund'>>;

// 實收:已付款訂單的總額扣掉退款(含運費);未付款為 0
export function orderRevenue(o: RevenueOrder) {
  if (!o.paid) return 0;
  return Math.max(0, Number(o.total || 0) - Number(o.refund_amount || 0));
}

// 運費實收(代收款):運費 − 運費折扣 − 已退運費;不超過訂單實收
export function shippingRevenue(o: RevenueOrder) {
  if (!o.paid) return 0;
  const shipping = Math.max(0, Number(o.shipping || 0) - Number(o.shipping_discount || 0) - Number(o.shipping_refund || 0));
  return Math.min(shipping, orderRevenue(o));
}

// 商品營收 = 實收 − 運費
export const productRevenue = (o: RevenueOrder) => orderRevenue(o) - shippingRevenue(o);

// 可退的運費(退款勾選「退運費」時用)
export const refundableShipping = (o: RevenueOrder) =>
  Math.max(0, Number(o.shipping || 0) - Number(o.shipping_discount || 0) - Number(o.shipping_refund || 0));
