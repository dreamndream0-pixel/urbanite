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
