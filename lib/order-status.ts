// 訂單三套狀態(訂單 / 付款 / 物流)的定義、中文標籤與換算。
// 後台仍以中文 status 作為主要操作,英文狀態由此檔集中換算與同步。

export type OrderStatus =
  | 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'CLOSED';
export type PaymentStatus =
  | 'UNPAID' | 'PENDING' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED' | 'CANCELLED';
export type FulfillmentStatus =
  | 'UNFULFILLED' | 'PREPARING' | 'READY_TO_SHIP' | 'SHIPPED' | 'IN_TRANSIT'
  | 'AT_STORE' | 'PICKED_UP' | 'DELIVERED' | 'RETURNING' | 'RETURNED';

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: '待處理', CONFIRMED: '已確認', PROCESSING: '處理中',
  COMPLETED: '已完成', CANCELLED: '已取消', CLOSED: '已關閉',
};
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: '未付款', PENDING: '付款處理中', PAID: '已付款',
  PARTIALLY_REFUNDED: '部分退款', REFUNDED: '已退款', FAILED: '付款失敗', CANCELLED: '已取消',
};
export const FULFILLMENT_STATUS_LABEL: Record<string, string> = {
  UNFULFILLED: '未出貨', PREPARING: '備貨中', READY_TO_SHIP: '待出貨',
  SHIPPED: '已出貨', IN_TRANSIT: '配送中',
  AT_STORE: '待取貨', PICKED_UP: '已取貨', DELIVERED: '已送達',
  RETURNING: '退貨中', RETURNED: '已退貨',
};

export type DerivedStatuses = {
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
};

// 從後台的中文 status + paid 換算出三套英文狀態(與 migration 的回填規則一致)。
export function deriveStatuses(status: string, paid: boolean): DerivedStatuses {
  const order_status: OrderStatus =
    status === '尚未付款' ? 'PENDING'
    : status === '待出貨' ? 'CONFIRMED'
    : status === '已出貨' ? 'PROCESSING'
    : status === '已完成' ? 'COMPLETED'
    : status === '取消' ? 'CANCELLED'
    : 'CONFIRMED';
  const fulfillment_status: FulfillmentStatus =
    status === '已出貨' ? 'SHIPPED'
    : status === '已完成' ? 'DELIVERED'
    : status === '退貨' ? 'RETURNED'
    : 'UNFULFILLED';
  const payment_status: PaymentStatus = paid ? 'PAID' : 'UNPAID';
  return { order_status, payment_status, fulfillment_status };
}

// 客人端進度條:五個節點(成立 → 付款 → 出貨 → 配送 → 完成)。
export type ProgressStep = { key: string; label: string; done: boolean; current: boolean };

export function buildProgress(order: {
  status: string;
  paid: boolean;
  fulfillment_status?: string;
  shipping_method?: string;
  created_at?: string;
}): ProgressStep[] {
  const cancelled = order.status === '取消';
  const f = order.fulfillment_status ?? '';
  const isPickup = /超商|取貨|7-?11|7-ELEVEN|全家|family|萊爾富|hi-?life|ok/i.test(order.shipping_method ?? '');
  const shipped = ['SHIPPED', 'IN_TRANSIT', 'AT_STORE', 'PICKED_UP', 'DELIVERED'].includes(f) || order.status === '已出貨' || order.status === '已完成';
  const inTransit = ['IN_TRANSIT', 'AT_STORE', 'PICKED_UP', 'DELIVERED'].includes(f) || order.status === '已完成';
  const completed = order.status === '已完成' || f === 'DELIVERED' || f === 'PICKED_UP';

  const flags = [true, order.paid, shipped, inTransit, completed];
  const labels = [
    { key: 'created', label: '訂單成立' },
    { key: 'paid', label: '付款完成' },
    { key: 'shipped', label: '商品出貨' },
    { key: 'transit', label: isPickup ? '待取貨' : '配送中' },
    { key: 'done', label: isPickup ? '已取貨完成' : '訂單完成' },
  ];
  if (cancelled) {
    return [
      { key: 'created', label: '訂單成立', done: true, current: false },
      { key: 'cancelled', label: '已取消', done: true, current: true },
    ];
  }
  // 目前節點 = 最後一個已完成節點
  let lastDone = 0;
  flags.forEach((v, i) => { if (v) lastDone = i; });
  return labels.map((l, i) => ({
    ...l,
    done: flags[i],
    current: i === lastDone && !completed,
  }));
}

// 會員「我的訂單」分頁
export type OrderTab = 'all' | 'unpaid' | 'to_ship' | 'shipping' | 'done' | 'returning' | 'cancelled';

export const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unpaid', label: '待付款' },
  { key: 'to_ship', label: '待出貨' },
  { key: 'shipping', label: '配送中' },
  { key: 'done', label: '已完成' },
  { key: 'returning', label: '退貨申請中' },
  { key: 'cancelled', label: '取消/已退貨' },
];

type TabOrder = {
  status: string;
  paid: boolean;
  fulfillment_status?: string;
  cancel_status?: string;
};

export function orderTabOf(order: TabOrder): Exclude<OrderTab, 'all'> {
  const f = order.fulfillment_status ?? '';
  if (f === 'RETURNING') return 'returning';                 // 退貨處理中
  if (order.status === '取消' || order.status === '退貨' || order.cancel_status === 'APPROVED' || f === 'RETURNED') return 'cancelled';
  if (order.status === '已完成' || f === 'DELIVERED' || f === 'PICKED_UP') return 'done';
  if (['SHIPPED', 'IN_TRANSIT', 'AT_STORE'].includes(f) || order.status === '已出貨') return 'shipping';
  if (!order.paid) return 'unpaid';
  return 'to_ship';
}

// 客人是否可提出取消申請:尚未出貨、未完成/取消、且沒有待審核或已核准的申請。
export function canRequestCancel(order: TabOrder): boolean {
  if (order.status === '取消' || order.status === '退貨' || order.status === '已完成') return false;
  if (order.cancel_status === 'REQUESTED' || order.cancel_status === 'APPROVED') return false;
  const f = order.fulfillment_status ?? '';
  if (['SHIPPED', 'IN_TRANSIT', 'AT_STORE', 'PICKED_UP', 'DELIVERED'].includes(f)) return false;
  return true;
}

export const CANCEL_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '取消審核中',
  APPROVED: '已核准取消',
  REJECTED: '取消申請被婉拒',
};

// 退貨狀態(§16)
export const RETURN_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '退貨申請中',
  APPROVED: '已核准，待寄回',
  REJECTED: '退貨申請被婉拒',
  SHIPPED_BACK: '買家已寄回',
  RECEIVED: '已收到退貨',
  PROCESSING: '退款處理中',
  REFUNDED: '已退款',
  COMPLETED: '已完成',
};

// 退貨是否已進入終結狀態(不可再變更)
export function isReturnTerminal(status: string): boolean {
  return status === 'REJECTED' || status === 'REFUNDED' || status === 'COMPLETED';
}

// 訂單是否可申請退貨:已送達 / 已完成,且未取消。
export function canRequestReturn(order: { status: string; fulfillment_status?: string }): boolean {
  if (order.status === '取消') return false;
  return order.status === '已完成' || order.fulfillment_status === 'DELIVERED' || order.fulfillment_status === 'PICKED_UP';
}
