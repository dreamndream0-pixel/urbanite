import type { Order, OrderStatusHistory, Refund, ReturnRequest } from '@/lib/types';

// 退貨訂單:有退貨申請,或物流狀態為退貨中 / 已退回
export function isReturnOrder(order: Pick<Order, 'status' | 'fulfillment_status'>, returns?: ReturnRequest[]) {
  return Boolean(returns?.length) || ['RETURNING', 'RETURNED'].includes(order.fulfillment_status ?? '') || order.status === '退貨';
}

export type ReturnStep = { key: string; label: string; done: boolean; current: boolean; danger: boolean; time?: string | null };

// 退貨進度:退貨已申請 → 退貨已收貨 → 退貨處理中 → 退款處理中 → 已退款
// 依最新一筆退貨申請與退款紀錄推算(後台與會員中心共用)
export function buildReturnSteps(
  order: Pick<Order, 'payment_status' | 'fulfillment_status'>,
  returns: ReturnRequest[],
  refunds: Refund[] = [],
): ReturnStep[] {
  const ret = [...returns].sort((a, b) => String(b.requested_at ?? b.created_at).localeCompare(String(a.requested_at ?? a.created_at)))[0];
  const st = ret?.status ?? '';
  const rejected = st === 'REJECTED';
  const refundDone = refunds.some((r) => r.status === 'COMPLETED');
  const refunded = refundDone || ['REFUNDED', 'COMPLETED'].includes(st) || ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.payment_status ?? '');
  const received = refunded || ['RECEIVED', 'PROCESSING'].includes(st) || Boolean(ret?.received_at) || order.fulfillment_status === 'RETURNED';
  // 「退款處理中」(PROCESSING) 代表退貨已處理完、進入退款
  const processed = refunded || refunds.length > 0 || st === 'PROCESSING';
  const refundStarted = refunded || refunds.length > 0;
  const raw = [
    { key: 'applied', label: '退貨已申請', done: true, time: ret?.requested_at ?? ret?.created_at },
    { key: 'received', label: rejected ? '退貨已拒絕' : '退貨已收貨', done: received, time: rejected ? ret?.reviewed_at : ret?.received_at },
    { key: 'processing', label: '退貨處理中', done: processed, time: undefined },
    { key: 'refunding', label: '退款處理中', done: refundStarted, time: undefined },
    { key: 'refunded', label: '已退款', done: refunded, time: refunded ? ret?.completed_at : undefined },
  ];
  const currentIndex = rejected ? 1 : raw.findIndex((step) => !step.done);
  return raw.map((step, i) => ({ ...step, current: i === currentIndex, danger: rejected && i === 1 }));
}

// 狀態歷程的分類標籤:退貨相關事件獨立顯示為「退貨」
export function historyKind(h: Pick<OrderStatusHistory, 'type' | 'to_status' | 'note'>) {
  if (/^RETURN/.test(h.to_status ?? '') || /退貨/.test(h.note ?? '')) return { label: '退貨', tone: '#c0392b' };
  if (h.type === 'payment') return { label: '付款', tone: '#2b5fa5' };
  if (h.type === 'fulfillment') return { label: '物流', tone: '#1f7a44' };
  return { label: '訂單', tone: '#ada265' };
}
