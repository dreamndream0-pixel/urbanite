// Seedance Studio 影片點數:點數方案、購買訂單(VP 開頭)入帳。影片網站以同一套 Supabase 會員登入,
// 點數與金流在本站處理;影片網站(Cloudflare Worker)與本站共用 VIDEO_STUDIO_SECRET,金流金鑰只留在本站。
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchesPaymentAmount } from '@/lib/payment-amount';

export const VIDEO_POINT_PACKAGES = [
  { key: 'p100', amount: 100, points: 100, label: '100 點' },
  { key: 'p300', amount: 300, points: 320, label: '320 點', note: '多送 20 點' },
  { key: 'p1000', amount: 1000, points: 1100, label: '1,100 點', note: '多送 100 點' },
] as const;
export type VideoPointPackage = (typeof VIDEO_POINT_PACKAGES)[number]['key'];
export const VIDEO_TRIAL_POINTS = 30;

export const videoStudioUrl = () => (process.env.VIDEO_STUDIO_URL?.trim() || 'https://seedance-studio.dreamndream0.workers.dev').replace(/\/$/, '');
const studioSecret = () => {
  const secret = process.env.VIDEO_STUDIO_SECRET?.trim() ?? '';
  return secret.length >= 32 ? secret : '';
};

export const isVideoOrderNo = (orderNo: string) => /^VP\d/.test(orderNo);
export function newVideoOrderNo() {
  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(2, 19).replace(/[-T:]/g, '');
  return `VP${stamp}${randomBytes(6).toString('hex')}`;
}

export async function videoPointsReady(): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc('video_points_version');
    return !error && data === 1;
  } catch { return false; }
}

// 影片網站呼叫本站(點數、扣點、退點、建立付款)時,以共用密鑰驗證(Authorization: Bearer <secret>)。
// 密鑰可設在環境變數 VIDEO_STUDIO_SECRET,或只把它的 SHA-256 存進資料表 video_studio_keys(本站不保存明文)。
export async function isVideoStudioRequest(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  if (token.length < 32 || token.length > 200) return false;
  const secret = studioSecret();
  if (secret) {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  try {
    const hash = createHash('sha256').update(token).digest('hex');
    const { data, error } = await createAdminClient().from('video_studio_keys').select('key_hash').eq('key_hash', hash).maybeSingle();
    return !error && data?.key_hash === hash;
  } catch { return false; }
}

type Payload = { Status?: string; Message?: string; Result?: Record<string, unknown> };
export async function settleVideoPayment(payload: Payload): Promise<{ ok: boolean; orderNo: string; reason?: string }> {
  const result = payload.Result ?? {};
  const orderNo = String(result.MerchantOrderNo ?? '').trim();
  if (payload.Status !== 'SUCCESS') return { ok: false, orderNo, reason: '付款未成功' };
  if (!matchesPaymentAmount(result.Amt, result.Amt)) return { ok: false, orderNo, reason: '金額不符:無效金額' };
  const tradeNo = typeof result.TradeNo === 'string' ? result.TradeNo.trim() : '';
  if (!orderNo || !tradeNo || tradeNo.length > 100) return { ok: false, orderNo, reason: '付款資料不完整' };
  try {
    // 入帳、帳本與餘額在同一個資料庫交易內完成;金額不符時由資料庫拒絕。
    const { data, error } = await createAdminClient().rpc('settle_video_points_v1', {
      p_order_no: orderNo, p_amount: Number(result.Amt), p_trade_no: tradeNo,
    });
    if (error || data !== true) return { ok: false, orderNo, reason: error?.message?.includes('AMOUNT_MISMATCH') ? '金額不符' : '付款入帳待重試' };
    return { ok: true, orderNo };
  } catch { return { ok: false, orderNo, reason: '付款入帳待重試' }; }
}
