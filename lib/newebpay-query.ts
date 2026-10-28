import { createHash, timingSafeEqual } from 'node:crypto';
import { getNewebpayConfig } from '@/lib/newebpay';

// Read-only query. Never treat a successful query itself as a successful payment.
export async function queryNewebpayPayment(orderNo: string, amount: number) {
  const cfg = await getNewebpayConfig();
  if (!cfg.merchantId || !cfg.hashKey || !cfg.hashIv || !/^VP\d[A-Za-z0-9]{1,45}$/.test(orderNo) || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('PAYMENT_QUERY_UNAVAILABLE');
  const fields = new URLSearchParams({ Amt: String(amount), MerchantID: cfg.merchantId, MerchantOrderNo: orderNo });
  const hash = (value: string) => createHash('sha256').update(value).digest('hex').toUpperCase();
  const response = await fetch(`https://${cfg.isProd ? 'core' : 'ccore'}.newebpay.com/API/QueryTradeInfo`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...Object.fromEntries(fields), Version: '1.3', RespondType: 'JSON', TimeStamp: String(Math.floor(Date.now() / 1000)), CheckValue: hash(`IV=${cfg.hashIv}&${fields}&Key=${cfg.hashKey}`) }),
    signal: AbortSignal.timeout(5000), cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw new Error('PAYMENT_QUERY_UNAVAILABLE');
  const payload = await response.json();
  if (payload?.Status !== 'SUCCESS') throw new Error('PAYMENT_QUERY_UNCONFIRMED_' + (/^[A-Z0-9_]{1,30}$/.test(payload?.Status || '') ? payload.Status : 'UNKNOWN'));
  const result = typeof payload.Result === 'string' ? JSON.parse(payload.Result) : payload.Result;
  if (!result || result.MerchantID !== cfg.merchantId || result.MerchantOrderNo !== orderNo || String(result.Amt) !== String(amount) || typeof result.TradeNo !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(result.TradeNo)) throw new Error('PAYMENT_QUERY_MISMATCH');
  const checkFields = new URLSearchParams({ Amt: String(result.Amt), MerchantID: result.MerchantID, MerchantOrderNo: result.MerchantOrderNo, TradeNo: result.TradeNo });
  const expected = Buffer.from(hash(`HashIV=${cfg.hashIv}&${checkFields}&HashKey=${cfg.hashKey}`));
  const received = Buffer.from(String(result.CheckCode || ''));
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('PAYMENT_QUERY_INVALID_SIGNATURE');
  return { paid: String(result.TradeStatus) === '1' && ['0', ''].includes(String(result.BackStatus ?? '')), tradeNo: result.TradeNo };
}
