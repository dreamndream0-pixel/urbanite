// 綠界(ECPay)AIO 全方位金流 — CheckMacValue 與參數組裝
// 演算法依 ECPay 官方 CheckMacValue 規格(SHA256,ecpayUrlEncode)。
import crypto from 'crypto';

export type EcpayParams = Record<string, string>;

// ── ECPay 專用 URL encode(僅用於 CheckMacValue)──
// encodeURIComponent 空格為 %20、不編碼 ~ ' ,需補 %20→+、~→%7e、'→%27,再轉小寫 + .NET 還原
export function ecpayUrlEncode(source: string): string {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');
  encoded = encoded.toLowerCase();
  const map: Record<string, string> = {
    '%2d': '-',
    '%5f': '_',
    '%2e': '.',
    '%21': '!',
    '%2a': '*',
    '%28': '(',
    '%29': ')',
  };
  for (const [k, v] of Object.entries(map)) encoded = encoded.split(k).join(v);
  return encoded;
}

// ── 產生 CheckMacValue(SHA256,大寫)──
export function generateCheckMacValue(
  params: EcpayParams,
  hashKey: string,
  hashIv: string,
): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramStr = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

// ── 驗證 CheckMacValue(timing-safe)──
export function verifyCheckMacValue(params: EcpayParams, hashKey: string, hashIv: string): boolean {
  const received = String(params.CheckMacValue || '');
  const calculated = generateCheckMacValue(params, hashKey, hashIv);
  const a = Buffer.from(received);
  const b = Buffer.from(calculated);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── 設定(環境變數;預設為官方測試碼 stage / MerchantID 3002607)──
export function getEcpayConfig() {
  const env = (process.env.ECPAY_ENV || 'stage').toLowerCase();
  const isProd = env === 'production' || env === 'prod';
  return {
    isProd,
    merchantId: process.env.ECPAY_MERCHANT_ID || '3002607',
    hashKey: process.env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6',
    hashIv: process.env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs',
    aioUrl: isProd
      ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
      : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    // 付款方式:ALL=全部(需商店已開通所有方式);Credit=只信用卡;ATM / CVS 等亦可
    // 若正式環境只開通了信用卡,設 ECPAY_CHOOSE_PAYMENT=Credit 可先上線收信用卡
    choosePayment: process.env.ECPAY_CHOOSE_PAYMENT || 'ALL',
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.urbanite.com.tw').replace(/\/$/, ''),
  };
}

// 台灣時間 yyyy/MM/dd HH:mm:ss
export function ecpayTradeDate(d = new Date()): string {
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tw.getUTCFullYear()}/${p(tw.getUTCMonth() + 1)}/${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}:${p(tw.getUTCSeconds())}`;
}

// ItemName:多項用 # 分隔,截斷到 200 字元內(避免被 ECPay 截斷造成 CheckMacValue 不一致)
export function buildItemName(items: { name: string; variant?: string; quantity: number }[]): string {
  const parts = items.map((it) => {
    const spec = it.variant && it.variant !== '標準款' ? ` ${it.variant}` : '';
    return `${it.name}${spec} x${it.quantity}`;
  });
  let name = parts.join('#') || '商品一批';
  // 移除會影響顯示/簽章的特殊字元
  name = name.replace(/[&=+]/g, ' ');
  if (name.length > 200) name = name.slice(0, 197) + '...';
  return name;
}

// ── 組出送往 ECPay 的完整參數(含 CheckMacValue)──
export function buildCheckoutParams(order: {
  order_no: string;
  total: number;
  items: { name: string; variant?: string; quantity: number }[];
}): { params: EcpayParams; action: string } {
  const cfg = getEcpayConfig();
  const params: EcpayParams = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: order.order_no, // 需 ≤20 英數字且唯一;UByyyymmdd0001 = 14 碼符合
    MerchantTradeDate: ecpayTradeDate(),
    PaymentType: 'aio',
    TotalAmount: String(Math.max(1, Math.round(order.total))),
    TradeDesc: 'URBANITE 線上訂單',
    ItemName: buildItemName(order.items),
    ReturnURL: `${cfg.siteUrl}/api/payment/ecpay/callback`, // Server-to-Server 通知
    OrderResultURL: `${cfg.siteUrl}/api/payment/ecpay/result`, // 付款後瀏覽器帶結果導回
    ClientBackURL: `${cfg.siteUrl}/checkout/complete?order_no=${encodeURIComponent(order.order_no)}`,
    ChoosePayment: cfg.choosePayment, // 由消費者在綠界頁選信用卡 / ATM / 超商等(可用 ECPAY_CHOOSE_PAYMENT 調整)
    EncryptType: '1',
    NeedExtraPaidInfo: 'N',
  };
  params.CheckMacValue = generateCheckMacValue(params, cfg.hashKey, cfg.hashIv);
  return { params, action: cfg.aioUrl };
}
