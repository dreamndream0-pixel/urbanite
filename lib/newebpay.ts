// 藍新金流(NewebPay)MPG 幕前支付 — AES-256-CBC 加解密、TradeSha、參數組裝
// 依官方技術串接手冊 NDNF-1.2.5。
import crypto from 'crypto';

export function getNewebpayConfig() {
  const env = (process.env.NEWEBPAY_ENV || 'stage').toLowerCase();
  const isProd = env === 'production' || env === 'prod';
  return {
    isProd,
    merchantId: process.env.NEWEBPAY_MERCHANT_ID || '',
    hashKey: process.env.NEWEBPAY_HASH_KEY || '',
    hashIv: process.env.NEWEBPAY_HASH_IV || '',
    mpgUrl: isProd
      ? 'https://core.newebpay.com/MPG/mpg_gateway'
      : 'https://ccore.newebpay.com/MPG/mpg_gateway',
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || 'https://urbanite-tw.vercel.app').replace(/\/$/, ''),
  };
}

// AES-256-CBC 加密(PKCS7)→ 十六進位字串。用於產生 TradeInfo。
export function aesEncrypt(plain: string, key: string, iv: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
  return cipher.update(plain, 'utf8', 'hex') + cipher.final('hex');
}

// AES-256-CBC 解密(十六進位 → 明文)。用於解 NotifyURL 回傳的 TradeInfo。
export function aesDecrypt(hex: string, key: string, iv: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
  decipher.setAutoPadding(true);
  return decipher.update(hex, 'hex', 'utf8') + decipher.final('utf8');
}

// TradeSha = SHA256("HashKey=<key>&<TradeInfo>&HashIV=<iv>") 轉大寫
export function tradeSha(tradeInfo: string, key: string, iv: string): string {
  const raw = `HashKey=${key}&${tradeInfo}&HashIV=${iv}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase();
}

// 驗證回傳的 TradeSha(timing-safe)
export function verifyTradeSha(tradeInfo: string, receivedSha: string, key: string, iv: string): boolean {
  const calc = tradeSha(tradeInfo, key, iv);
  const a = Buffer.from(String(receivedSha || ''));
  const b = Buffer.from(calc);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 商品描述:藍新 ItemDesc 建議 50 字元內,超過截斷
export function buildItemDesc(items: { name: string; variant?: string; quantity: number }[]): string {
  const parts = items.map((it) => {
    const spec = it.variant && it.variant !== '標準款' ? ` ${it.variant}` : '';
    return `${it.name}${spec} x${it.quantity}`;
  });
  let desc = parts.join('、') || '商品一批';
  desc = desc.replace(/[&=]/g, ' ');
  if (desc.length > 50) desc = desc.slice(0, 47) + '...';
  return desc;
}

// 組出送往藍新 MPG 的表單參數(MerchantID / TradeInfo / TradeSha / Version)
export function buildMPGParams(order: {
  order_no: string;
  total: number;
  email?: string;
  items: { name: string; variant?: string; quantity: number }[];
}): { params: Record<string, string>; action: string } {
  const cfg = getNewebpayConfig();
  const trade: Record<string, string> = {
    MerchantID: cfg.merchantId,
    RespondType: 'JSON',
    TimeStamp: String(Math.floor(Date.now() / 1000)),
    Version: '2.0',
    MerchantOrderNo: order.order_no,
    Amt: String(Math.max(1, Math.round(order.total))),
    ItemDesc: buildItemDesc(order.items),
    Email: order.email || '',
    NotifyURL: `${cfg.siteUrl}/api/payment/newebpay/notify`,
    ReturnURL: `${cfg.siteUrl}/api/payment/newebpay/return`,
    ClientBackURL: `${cfg.siteUrl}/checkout/complete?order_no=${encodeURIComponent(order.order_no)}`,
    // 啟用的支付工具(需先在藍新後台開通):信用卡一次付清 + Apple Pay
    CREDIT: '1',
    APPLEPAY: '1',
  };
  const query = new URLSearchParams(trade).toString();
  const tradeInfo = aesEncrypt(query, cfg.hashKey, cfg.hashIv);
  const sha = tradeSha(tradeInfo, cfg.hashKey, cfg.hashIv);
  return {
    params: {
      MerchantID: cfg.merchantId,
      TradeInfo: tradeInfo,
      TradeSha: sha,
      Version: '2.0',
    },
    action: cfg.mpgUrl,
  };
}
