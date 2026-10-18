// 預約 E3:名片主人自己的 LINE 官方帳號
// - 金鑰加密存放(integration_settings: SHOP_BKLINE:<business_id>),只在伺服器端讀
// - LINE userId 依 Provider 而不同,所以顧客 / 店家要在「這家店的官方帳號」傳綁定碼,我們才拿得到可推播的 userId
// - 有連接自己的官方帳號時,這家店的所有預約通知都改由店家官方帳號發送;沒連接的照舊用平台官方帳號
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getShopSecret, setShopSecret } from '@/lib/integrations';
import { replyMessage, verifyLineSignature, type LineMessage } from '@/lib/line-messaging';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { BookingError } from './server';

const db = () => createAdminClient();
const KIND = 'BKLINE';
export type BizLineConfig = { channelSecret: string; accessToken: string };
export type LineRole = 'customer' | 'owner';

export const getBizLine = (businessId: string) => getShopSecret<BizLineConfig>(KIND, businessId);

export function bizWebhookUrl(businessId: string) {
  return `${getConfiguredSiteUrl()}/api/booking/line/${businessId}`;
}

async function botInfo(accessToken: string) {
  const res = await fetch('https://api.line.me/v2/bot/info', { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as { displayName?: string; basicId?: string };
}

// 儲存金鑰:先用 access token 讀官方帳號資訊,讀不到就是金鑰錯誤
export async function saveBizLine(businessId: string, cfg: BizLineConfig) {
  const channelSecret = cfg.channelSecret.trim();
  const accessToken = cfg.accessToken.trim();
  if (!/^[0-9a-f]{32}$/i.test(channelSecret)) throw new BookingError('VALIDATION_ERROR', 'Channel secret 格式不對(應為 32 碼英數字)。', 422);
  if (accessToken.length < 40) throw new BookingError('VALIDATION_ERROR', '請貼上完整的 Channel access token(長期)。', 422);
  const info = await botInfo(accessToken);
  if (!info?.basicId) throw new BookingError('VALIDATION_ERROR', '金鑰無法連線,請確認 Channel access token 是否正確、官方帳號是否已啟用 Messaging API。', 422);
  await setShopSecret(KIND, businessId, { channelSecret, accessToken });
  await db().from('bk_businesses').update({ line_own: true, line_basic_id: info.basicId, line_name: info.displayName ?? '' }).eq('id', businessId);
  return { basicId: info.basicId, name: info.displayName ?? '' };
}

// 移除連線:之後改回平台官方帳號發送;綁定紀錄一併清除(換帳號後 userId 也不同)
export async function removeBizLine(businessId: string) {
  await setShopSecret(KIND, businessId, null);
  await db().from('bk_businesses').update({ line_own: false, line_basic_id: '', line_name: '' }).eq('id', businessId);
  await db().from('bk_line_links').delete().eq('business_id', businessId);
  await db().from('bk_line_codes').delete().eq('business_id', businessId);
}

export async function isLinked(businessId: string, userId: string, role: LineRole) {
  const { data } = await db().from('bk_line_links').select('line_user_id').eq('business_id', businessId).eq('user_id', userId).eq('role', role).maybeSingle();
  return Boolean(data);
}

export async function linkedLineId(businessId: string, userId: string, role: LineRole) {
  const { data } = await db().from('bk_line_links').select('line_user_id').eq('business_id', businessId).eq('user_id', userId).eq('role', role).maybeSingle();
  return (data?.line_user_id as string | undefined) ?? null;
}

// 綁定碼:6 碼(去掉容易看錯的 0/O/1/I),30 分鐘有效;同一人重複索取會換新碼
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function createBindCode(businessId: string, basicId: string, userId: string, role: LineRole) {
  await db().from('bk_line_codes').delete().eq('business_id', businessId).eq('user_id', userId).eq('role', role);
  await db().from('bk_line_codes').delete().lt('expires_at', new Date().toISOString());
  for (let i = 0; i < 5; i++) {
    const code = Array.from(crypto.randomBytes(6), (n) => ALPHABET[n % ALPHABET.length]).join('');
    const { error } = await db().from('bk_line_codes').insert({ code, business_id: businessId, user_id: userId, role, expires_at: new Date(Date.now() + 30 * 60000).toISOString() });
    if (!error) {
      const text = `綁定 ${code}`;
      return { code, text, url: `https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${encodeURIComponent(text)}` };
    }
  }
  throw new BookingError('SERVER_ERROR', '產生綁定碼失敗,請再試一次。', 500);
}

type LineEvent = { type: string; replyToken?: string; source?: { type: string; userId?: string }; message?: { type: string; text?: string } };
const text = (t: string): LineMessage => ({ type: 'text', text: t });

// 店家官方帳號的 Webhook:驗證簽章 → 綁定碼完成綁定;加好友時說明怎麼綁定;其他訊息不自動回覆(留給店家真人回覆)
export async function handleBizWebhook(businessId: string, raw: string, signature: string | null) {
  if (!/^[0-9a-f-]{36}$/.test(businessId)) return { status: 404, body: { error: 'not found' } };
  const cfg = await getBizLine(businessId);
  if (!cfg) return { status: 404, body: { error: 'not connected' } };
  if (!verifyLineSignature(raw, signature, cfg.channelSecret)) return { status: 401, body: { error: 'invalid signature' } };
  const events = (JSON.parse(raw || '{}') as { events?: LineEvent[] }).events ?? [];
  const { data: biz } = await db().from('bk_businesses').select('name, card_id').eq('id', businessId).maybeSingle();
  const { data: card } = biz?.card_id ? await db().from('profile_cards').select('slug, display_name').eq('id', biz.card_id).maybeSingle() : { data: null };
  const shopName = biz?.name || card?.display_name || '我們';
  const bookUrl = `${getConfiguredSiteUrl()}/@${card?.slug ?? ''}/book`;

  for (const event of events) {
    const lineUserId = event.source?.type === 'user' ? event.source.userId : undefined;
    if (!lineUserId) continue;
    if (event.type === 'unfollow') {
      await db().from('bk_line_links').delete().eq('business_id', businessId).eq('line_user_id', lineUserId);
      continue;
    }
    if (!event.replyToken) continue;
    if (event.type === 'follow') {
      await replyMessage(event.replyToken, [text(`謝謝你加入 ${shopName}!\n在預約頁按「加入官方 LINE 接收通知」,就會自動傳送綁定碼,之後的預約確認與提醒都會從這裡通知你。\n${bookUrl}`)], cfg.accessToken);
      continue;
    }
    const msg = event.type === 'message' && event.message?.type === 'text' ? (event.message.text ?? '').trim() : '';
    const m = msg.match(/^綁定\s*([A-Z0-9]{6})$/i);
    if (!m) continue;
    const { data: row } = await db().from('bk_line_codes').select('*').eq('code', m[1].toUpperCase()).eq('business_id', businessId).maybeSingle();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      await replyMessage(event.replyToken, [text(`這個綁定碼已失效,請回到預約頁重新按一次「加入官方 LINE 接收通知」。\n${bookUrl}`)], cfg.accessToken);
      continue;
    }
    await db().from('bk_line_links').upsert({ business_id: businessId, user_id: row.user_id, role: row.role, line_user_id: lineUserId }, { onConflict: 'business_id,user_id,role' });
    await db().from('bk_line_codes').delete().eq('code', row.code);
    await replyMessage(event.replyToken, [text(row.role === 'owner'
      ? '綁定完成。之後有新預約、顧客回報付款或取消,都會從這個官方帳號通知你。'
      : `綁定完成!之後 ${shopName} 的預約確認、提醒與異動都會從這裡通知你。`)], cfg.accessToken);
  }
  return { status: 200, body: { ok: true } };
}
