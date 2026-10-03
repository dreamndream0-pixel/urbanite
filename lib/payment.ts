// 判斷付款方式是否走藍新線上金流(建單後導向藍新付款頁)。
// 名稱含「藍新 / 信用卡 / Line Pay / Apple Pay」者視為藍新線上金流;
// 其餘(如銀行轉帳、貨到付款)為非藍新,結帳後顯示賣家收款資訊或由買家回報付款。
export function isOnlinePayment(method: string): boolean {
  return /藍新|信用卡|line\s?pay|apple\s?pay/i.test(method);
}

// 是否為「到店/到貨時才收款」(門市取貨付款、宅配貨到付款)。
// 這類不需客人線上先付款,下單後直接進「待出貨」;其餘(取貨不付款、宅配線上付款、轉帳)
// 需客人自己付款,下單後進「尚未付款(待付款)」。
export function isCollectOnDelivery(shippingMethod = '', paymentMethod = ''): boolean {
  if (/不付款|不代收/.test(shippingMethod)) return false; // 「取貨不付款」= 已線上付款,純取貨
  return /取貨付款|貨到付款|門市付款|cod/i.test(shippingMethod) || /取貨付款|貨到付款|門市付款|cod/i.test(paymentMethod);
}

// 下單當下的訂單初始狀態:到店/到貨收款 → 待出貨;需線上付款 → 尚未付款。
export function initialOrderStatus(shippingMethod = '', paymentMethod = ''): '待出貨' | '尚未付款' {
  return isCollectOnDelivery(shippingMethod, paymentMethod) ? '待出貨' : '尚未付款';
}

// 線上付款的付款期限天數(下單後 N 天內未付款自動取消)。可用環境變數覆寫,預設 3 天。
export function paymentDeadlineDays(): number {
  const n = Number(process.env.PAYMENT_DEADLINE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// 由建立時間推導付款期限(不需資料庫欄位)。
export function paymentDeadline(createdAt: string | number | Date, days = paymentDeadlineDays()): Date {
  return new Date(new Date(createdAt).getTime() + days * 24 * 3600 * 1000);
}

type PayableOrder = {
  paid?: boolean;
  status?: string;
  cancel_status?: string;
  fulfillment_status?: string;
  payment_method?: string;
  shipping_method?: string;
};

// 訂單是否在「等客人付款」:未付款、需先付款(非取貨付款/貨到付款)、尚未出貨、未取消/退貨。
// 付款期限提示與逾期自動取消共用此規則(不只看 status 是否為「尚未付款」)。
export function awaitingPayment(order: PayableOrder): boolean {
  if (order.paid) return false;
  if (['取消', '退貨', '已完成'].includes(order.status ?? '')) return false;
  if (order.cancel_status === 'APPROVED') return false;
  if (['SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNING', 'RETURNED'].includes(order.fulfillment_status ?? '')) return false;
  if (isCollectOnDelivery(order.shipping_method ?? '', order.payment_method ?? '')) return false;
  return true;
}

// 是否已超過付款期限(且仍在等付款)
export function isPaymentOverdue(order: PayableOrder & { created_at?: string }, now = Date.now(), days = paymentDeadlineDays()): boolean {
  if (!order.created_at || !awaitingPayment(order)) return false;
  return paymentDeadline(order.created_at, days).getTime() < now;
}
