import type { Order, Shipment } from '@/lib/types';

export function manualOrderActions(order: Order, shipments: Shipment[], hasReturn: boolean) {
  const shipped = ['SHIPPED', 'IN_TRANSIT', 'AT_STORE', 'DELIVERED', 'PICKED_UP'];
  const last = shipments[0];
  const blocked = shipments.length !== 1 || !last || hasReturn || shipments.some(s => s.lgs_type || s.ship_type || /^(newebpay|ecpay)$/i.test(s.provider ?? '')) ||
    ['取消', '已取消', '退貨'].includes(order.status) || ['CANCELLED', 'CLOSED', 'COMPLETED'].includes(order.order_status ?? '') ||
    ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.payment_status ?? '') || ['REQUESTED', 'APPROVED'].includes(order.cancel_status ?? '') ||
    !shipped.includes(order.fulfillment_status ?? '') || !shipped.includes(last.status);
  return { arrived: !blocked && ['SHIPPED', 'IN_TRANSIT'].includes(last.status) && ['SHIPPED', 'IN_TRANSIT'].includes(order.fulfillment_status ?? ''), complete: !blocked };
}
