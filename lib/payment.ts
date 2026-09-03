// 判斷付款方式是否走藍新線上金流(建單後導向藍新付款頁)。
// 名稱含「藍新 / 信用卡 / Line Pay / Apple Pay」者視為藍新線上金流;
// 其餘(如銀行轉帳、貨到付款)為非藍新,結帳後顯示賣家收款資訊或由買家回報付款。
export function isOnlinePayment(method: string): boolean {
  return /藍新|信用卡|line\s?pay|apple\s?pay/i.test(method);
}
