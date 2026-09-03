// 判斷付款方式是否走綠界線上金流(建單後導向綠界付款頁)。
// 名稱含「綠界 / 信用卡 / Line Pay / Apple Pay」者視為綠界線上金流;
// 其餘(如銀行轉帳、貨到付款)為非綠界,結帳後顯示賣家收款資訊或由買家回報付款。
export function isEcpayMethod(method: string): boolean {
  return /綠界|信用卡|line\s?pay|apple\s?pay/i.test(method);
}
