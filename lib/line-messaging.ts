import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getIntegrations } from '@/lib/integrations';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import type { Discount, Order } from '@/lib/types';

// LINE 官方帳號(Messaging API):會員綁定 LINE userId,綁定後可在 LINE 查詢自己的資料

const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });
const BIND_TOKEN_TTL = 30 * 60 * 1000; // 綁定連結 30 分鐘內有效

export async function getMessagingConfig() {
  const cfg = await getIntegrations(['LINE_MESSAGING_CHANNEL_SECRET', 'LINE_MESSAGING_ACCESS_TOKEN'] as const);
  return { channelSecret: cfg.LINE_MESSAGING_CHANNEL_SECRET, accessToken: cfg.LINE_MESSAGING_ACCESS_TOKEN };
}

// Webhook 簽章:HMAC-SHA256(channel secret, 原始 body) 的 base64
export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string) {
  if (!signature || !channelSecret) return false;
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- 綁定連結(簽章、有時效,內容只有 LINE userId) ----------
export function createBindToken(lineUserId: string, channelSecret: string) {
  const payload = Buffer.from(JSON.stringify({ u: lineUserId, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', `bind:${channelSecret}`).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyBindToken(token: string, channelSecret: string): { lineUserId: string } {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !channelSecret) throw new Error('綁定連結無效,請回到 LINE 重新取得');
  const expected = crypto.createHmac('sha256', `bind:${channelSecret}`).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('綁定連結無效,請回到 LINE 重新取得');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: string; t?: number };
  if (!data.u || !data.t || Date.now() - data.t > BIND_TOKEN_TTL) throw new Error('綁定連結已過期,請回到 LINE 輸入「綁定」重新取得');
  return { lineUserId: data.u };
}

export function bindUrl(token: string) {
  // openExternalBrowser:在手機預設瀏覽器開啟(通常已登入官網),避免 LINE 內建瀏覽器沒有登入狀態
  return `${getConfiguredSiteUrl()}/line/bind?t=${encodeURIComponent(token)}&openExternalBrowser=1`;
}

// ---------- LINE API ----------
export type LineMessage = Record<string, unknown>;

export async function replyMessage(replyToken: string, messages: LineMessage[], accessToken: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) console.error('LINE reply failed', res.status, await res.text().catch(() => ''));
}

export async function fetchBotProfile(lineUserId: string, accessToken: string) {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { displayName?: string; pictureUrl?: string };
}

// 常用查詢的快速回覆按鈕
const QUICK_REPLY = {
  items: ['訂單查詢', '優惠券', '購物金', '會員資料'].map((label) => ({ type: 'action', action: { type: 'message', label, text: label } })),
};

export function text(textValue: string, withMenu = true): LineMessage {
  return withMenu ? { type: 'text', text: textValue, quickReply: QUICK_REPLY } : { type: 'text', text: textValue };
}

// ---------- 會員 ----------
type BoundCustomer = { user_id: string; email: string | null; name: string | null; phone: string | null; line_display_name: string | null };

// 找出綁定這個 LINE 的會員(只看已綁定的;LINE 登入時會自動綁定)
export async function findCustomerByLine(lineUserId: string): Promise<BoundCustomer | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('customers').select('user_id, email, name, phone, line_display_name').eq('line_user_id', lineUserId).maybeSingle();
  return data?.user_id ? (data as BoundCustomer) : null;
}

// transfer:經 LINE 授權驗證過是本人的 LINE 時,可把綁定從本人的其他帳號轉到目前帳號
export async function bindLineToUser(
  userId: string,
  email: string,
  lineUserId: string,
  profile: { displayName?: string; pictureUrl?: string } | null,
  { transfer = false }: { transfer?: boolean } = {},
) {
  const supabase = createAdminClient();
  // 舊帳號可能還沒有會員資料列,先補建
  const { data: mine } = await supabase.from('customers').select('user_id').eq('user_id', userId).maybeSingle();
  if (!mine) await supabase.from('customers').insert({ user_id: userId, email, name: '', phone: '' });
  const { data: other } = await supabase.from('customers').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (other?.user_id && other.user_id !== userId) {
    if (!transfer) throw new Error('這個 LINE 已綁定其他會員帳號,請先用該帳號解除綁定');
    await supabase
      .from('customers')
      .update({ line_user_id: null, line_display_name: '', line_picture_url: '', line_bound_at: null })
      .eq('user_id', other.user_id);
  }
  const { error } = await supabase
    .from('customers')
    .update({
      line_user_id: lineUserId,
      line_display_name: profile?.displayName ?? '',
      line_picture_url: profile?.pictureUrl ?? '',
      line_bound_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// ---------- 查詢內容 ----------
const dateText = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '');

export async function ordersText(userId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('orders')
    .select('order_no, status, total, created_at, items')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
  const orders = (data ?? []) as Pick<Order, 'order_no' | 'status' | 'total' | 'created_at' | 'items'>[];
  if (!orders.length) return '目前沒有訂單紀錄。';
  const lines = orders.map((o) => {
    const count = Array.isArray(o.items) ? o.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0) : 0;
    return `📦 ${o.order_no}\n${dateText(o.created_at)}・${count} 件・${formatter.format(o.total)}\n狀態:${o.status}`;
  });
  return `最近 ${orders.length} 筆訂單\n\n${lines.join('\n\n')}\n\n完整明細:${getConfiguredSiteUrl()}/account?tab=orders`;
}

function couponValue(c: Discount) {
  if (c.type === 'percent') return `${c.value}% 折扣`;
  if (c.type === 'free_shipping') return '免運';
  return `折抵 ${formatter.format(c.value)}`;
}

export async function couponsText(userId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('user_coupons')
    .select('status, expired_at, coupon:discounts(name, code, type, value, min_spend, end_at)')
    .eq('user_id', userId)
    .eq('status', 'available')
    .order('received_at', { ascending: false });
  const now = Date.now();
  const rows = ((data ?? []) as unknown as { expired_at: string | null; coupon: Discount | null }[]).filter((r) => {
    const end = r.coupon?.end_at ?? r.expired_at;
    return r.coupon && (!end || new Date(end).getTime() > now);
  });
  if (!rows.length) return `目前沒有可使用的優惠券。\n\n領取優惠券:${getConfiguredSiteUrl()}/account?tab=coupons`;
  const lines = rows.slice(0, 8).map(({ coupon: c, expired_at }) => {
    const end = c!.end_at ?? expired_at;
    const min = c!.min_spend ? `滿 ${formatter.format(c!.min_spend)}` : '無門檻';
    return `🎟 ${c!.name || c!.code}\n${couponValue(c!)}・${min}\n代碼:${c!.code}${end ? `\n使用期限:${dateText(end)}` : ''}`;
  });
  return `可使用的優惠券 ${rows.length} 張\n\n${lines.join('\n\n')}`;
}

// 購物金目前尚未開放累積,先回覆餘額 0
export async function creditText() {
  return `購物金餘額:${formatter.format(0)}\n\n消費與活動累積的購物金會顯示在這裡。`;
}

// 個資遮蔽:0989****58、dr****@gmail.com
const maskPhone = (p: string) => (p.length >= 7 ? `${p.slice(0, 4)}****${p.slice(-2)}` : '****');
const maskEmail = (e: string) => {
  const [name, domain] = e.split('@');
  return domain ? `${name.slice(0, 2)}****@${domain}` : '****';
};

export async function memberText(customer: BoundCustomer) {
  const supabase = createAdminClient();
  const [{ count: orderCount }, { count: couponCount }] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', customer.user_id),
    supabase.from('user_coupons').select('id', { count: 'exact', head: true }).eq('user_id', customer.user_id).eq('status', 'available'),
  ]);
  const email = customer.email && !customer.email.endsWith('@line.urbanite.com.tw') ? customer.email : '';
  return [
    `👤 ${customer.name || customer.line_display_name || '會員'}`,
    email ? `Email:${maskEmail(email)}` : '',
    customer.phone ? `手機:${maskPhone(customer.phone)}` : '',
    `訂單:${orderCount ?? 0} 筆`,
    `可用優惠券:${couponCount ?? 0} 張`,
    `購物金:${formatter.format(0)}`,
    '',
    `會員中心:${getConfiguredSiteUrl()}/account`,
  ]
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join('\n');
}
