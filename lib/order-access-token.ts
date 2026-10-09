import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

export const ORDER_ACCESS_MAX_AGE = 7 * 24 * 60 * 60;
function signingKey() {
  const key = process.env.ORDER_ACCESS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Order access signing key is unavailable');
  return key;
}
export function orderAccessCookieName(orderNo: string) {
  return `order_access_${createHash('sha256').update(orderNo).digest('hex').slice(0, 24)}`;
}
function signature(payload: string) {
  return createHmac('sha256', signingKey()).update(`urbanite-order-access:v1:${payload}`).digest('hex');
}
export function createOrderAccessToken(orderNo: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ orderNo, expires: now + ORDER_ACCESS_MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function verifyOrderAccessToken(token: string | undefined, orderNo: string, now = Date.now()) {
  if (!token || token.length > 1024) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
    if (!timingSafeEqual(Buffer.from(parts[1], 'hex'), Buffer.from(signature(parts[0]), 'hex'))) return false;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload.orderNo === orderNo && Number.isSafeInteger(payload.expires) && payload.expires > now;
  } catch { return false; }
}
