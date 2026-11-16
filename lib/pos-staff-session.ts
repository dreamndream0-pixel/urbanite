// POS 員工登入:員工編號 + 密碼(後台建立),登入後用簽章 cookie 記住這一班。
// 和會員 / 後台的登入(Supabase)完全分開,員工不需要會員帳號。
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const POS_STAFF_COOKIE = 'pos_staff';
export const POS_STAFF_MAX_AGE = 16 * 60 * 60; // 16 小時:一個營業日,隔天要重新登入
export const MAX_FAILED = 5; // 連續輸錯幾次鎖定
export const LOCK_MINUTES = 5;
export const STAFF_CODE_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;

function signingKey() {
  const key = process.env.POS_STAFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('POS staff signing key is unavailable');
  return key;
}
const signature = (payload: string) => createHmac('sha256', signingKey()).update(`urbanite-pos-staff:v1:${payload}`).digest('hex');

export function createStaffToken(staffId: string, shopId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sid: staffId, shop: shopId, exp: now + POS_STAFF_MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

// 驗證 cookie:簽章正確、沒過期、而且是這家店的 → 回傳員工 id
export function verifyStaffToken(token: string | undefined, shopId: string, now = Date.now()): string | null {
  if (!token || token.length > 1024) return null;
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !/^[a-f0-9]{64}$/.test(sig ?? '')) return null;
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(signature(payload), 'hex'))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.shop === shopId && typeof data.sid === 'string' && Number.isSafeInteger(data.exp) && data.exp > now ? data.sid : null;
  } catch { return null; }
}

export function passwordError(password: string) {
  if (password.length < 4) return '密碼至少 4 個字';
  if (password.length > 64) return '密碼太長';
  return '';
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !/^[a-f0-9]{64}$/.test(hash ?? '')) return false;
  try { return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, Buffer.from(salt, 'hex'), 32)); } catch { return false; }
}
