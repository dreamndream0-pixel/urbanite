import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { bindUrl, createBindToken, getMessagingConfig, type LineMessage } from '@/lib/line-messaging';
import {
  MENU_LAYOUTS,
  MENU_SIZE,
  PAGE_OPTIONS,
  resolveBotConfig,
  type BotAction,
  type BotCard,
  type BotConfig,
  type BotRule,
  type BroadcastAudience,
  type MessageSet,
  type NotifyKey,
  type RichMenu,
} from '@/lib/line-bot-types';
import type { Discount } from '@/lib/types';

const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';
const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

// ---------- 設定 ----------
export async function loadBotConfig(): Promise<{ config: BotConfig; raw: Record<string, unknown> }> {
  const { data } = await createAdminClient().from('line_bot_config').select('data').eq('id', 1).maybeSingle();
  const raw = (data?.data ?? {}) as Record<string, unknown>;
  return { config: resolveBotConfig(raw), raw };
}

export async function saveBotConfig(patch: Record<string, unknown>) {
  const supabase = createAdminClient();
  const { raw } = await loadBotConfig();
  const next = { ...raw, ...patch };
  const { error } = await supabase.from('line_bot_config').upsert({ id: 1, data: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return next;
}

export async function loadRules(onlyEnabled = false): Promise<BotRule[]> {
  let q = createAdminClient().from('line_bot_rules').select('*').order('sort_order').order('created_at');
  if (onlyEnabled) q = q.eq('enabled', true);
  const { data } = await q;
  return (data ?? []) as BotRule[];
}

// ---------- 事件紀錄 ----------
export async function logEvent(type: string, lineUserId: string | null, key = '') {
  try {
    await createAdminClient().from('line_events').insert({ type, line_user_id: lineUserId, key: key.slice(0, 200) });
  } catch {
    /* 紀錄失敗不影響回覆 */
  }
}

// ---------- 點擊追蹤:簽章過的轉址(只轉到簽章時的網址) ----------
function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', `track:${secret}`).update(value).digest('base64url').slice(0, 16);
}

export function trackedUrl(url: string, key: string, secret: string) {
  const target = url.startsWith('/') ? `${getConfiguredSiteUrl()}${url}` : url;
  if (!secret) return target;
  const params = new URLSearchParams({ u: target, k: key.slice(0, 60) });
  params.set('s', sign(`${target}|${params.get('k')}`, secret));
  return `${getConfiguredSiteUrl()}/api/line/r?${params.toString()}`;
}

export function verifyTracked(u: string, k: string, s: string, secret: string) {
  return Boolean(secret) && sign(`${u}|${k}`, secret) === s;
}

// ---------- 規則比對 ----------
const taipeiNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, time: `${get('hour').replace('24', '00')}:${get('minute')}` };
};

export function ruleActiveNow(rule: Pick<BotRule, 'schedule'>) {
  const s = rule.schedule;
  if (!s || !s.start || !s.end) return true;
  const { day, time } = taipeiNow();
  if (Array.isArray(s.days) && s.days.length && !s.days.includes(day)) return false;
  return s.start <= s.end ? time >= s.start && time < s.end : time >= s.start || time < s.end; // 支援跨午夜
}

export function keywordMatches(keywords: string[], input: string, match: 'exact' | 'contains') {
  const text = input.trim().toLowerCase();
  return keywords.some((k) => {
    const kw = k.trim().toLowerCase();
    if (!kw) return false;
    return match === 'exact' ? text === kw : text.includes(kw);
  });
}

// ---------- 訊息轉換(後台編輯格式 → LINE 訊息) ----------
export type SendContext = { vars: Record<string, string>; lineUserId?: string; trackKey: string };

export function fillVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{([^{}]+)\}/g, (m, name) => (name in vars ? vars[name] : m));
}

const abs = (url: string) => (url.startsWith('/') ? `${getConfiguredSiteUrl()}${url}` : url);
const label = (t: string) => (t.trim() || '查看').slice(0, 20);

function lineAction(action: BotAction, text: string, ctx: SendContext, secret: string, index: number) {
  if (action.type === 'keyword') return { type: 'message', label: label(text), text: action.value.slice(0, 300) || label(text) };
  const url = action.type === 'page' ? PAGE_OPTIONS.find((p) => p.key === action.value)?.path ?? '/' : action.value;
  return { type: 'uri', label: label(text), uri: trackedUrl(url || '/', `${ctx.trackKey}:${index}`, secret) };
}

function bubble(card: BotCard, brand: string, ctx: SendContext, secret: string, hero?: { aspect: string; url?: string }) {
  const title = fillVars(card.title, ctx.vars).trim();
  const body = fillVars(card.body, ctx.vars).trim();
  const buttons = card.buttons.filter((b) => b.label.trim()).slice(0, 3);
  return {
    type: 'bubble',
    ...(card.image
      ? { hero: { type: 'image', url: abs(card.image), size: 'full', aspectRatio: hero?.aspect ?? '20:13', aspectMode: 'cover' } }
      : {}),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '18px',
      contents: [
        ...(title ? [{ type: 'text', text: title.slice(0, 80), weight: 'bold', size: 'md', wrap: true, color: '#1f1b19' }] : []),
        ...(body ? [{ type: 'text', text: body.slice(0, 500), size: 'sm', wrap: true, color: '#6b6156' }] : []),
        ...(!title && !body ? [{ type: 'text', text: ' ', size: 'xxs' }] : []),
      ],
    },
    ...(buttons.length
      ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            paddingAll: '12px',
            contents: buttons.map((b, i) => ({
              type: 'button',
              height: 'sm',
              style: i === 0 ? 'primary' : 'link',
              ...(i === 0 ? { color: brand } : { color: '#6b6156' }),
              action: lineAction(b.action, b.label, ctx, secret, i),
            })),
          },
        }
      : {}),
  };
}

function couponBubble(c: Discount, brand: string, ctx: SendContext, secret: string) {
  const value = c.type === 'percent' ? `${c.value}% OFF` : c.type === 'free_shipping' ? '免運' : `折 ${formatter.format(c.value)}`;
  const rule = [c.min_spend ? `滿 ${formatter.format(c.min_spend)} 可用` : '無消費門檻', c.end_at ? `${new Date(c.end_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })} 前有效` : ''].filter(Boolean).join('・');
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'COUPON', size: 'xxs', color: '#a99e8f', weight: 'bold' },
        { type: 'text', text: (c.name || c.code).slice(0, 60), size: 'md', weight: 'bold', color: '#1f1b19', wrap: true },
        { type: 'text', text: value, size: 'xxl', weight: 'bold', color: brand, margin: 'md' },
        { type: 'text', text: rule, size: 'xs', color: '#8a7f72', wrap: true },
        { type: 'separator', margin: 'lg', color: '#eee6db' },
        { type: 'text', text: `代碼 ${c.code}`, size: 'xs', color: '#6b6156', margin: 'md' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{ type: 'button', style: 'primary', height: 'sm', color: brand, action: lineAction({ type: 'page', value: 'coupons' }, '領取優惠券', ctx, secret, 0) }],
    },
  };
}

function quickReply(items: string[]) {
  const list = items.map((t) => t.trim()).filter(Boolean).slice(0, 13);
  return list.length ? { items: list.map((t) => ({ type: 'action', action: { type: 'message', label: t.slice(0, 20), text: t } })) } : undefined;
}

export async function toLineMessages(set: MessageSet, ctx: SendContext, brand: string): Promise<LineMessage[]> {
  const { channelSecret } = await getMessagingConfig();
  const supabase = createAdminClient();
  const out: LineMessage[] = [];
  for (const m of set.messages.slice(0, 5)) {
    if (m.type === 'text') {
      const t = fillVars(m.text, ctx.vars).trim();
      if (t) out.push({ type: 'text', text: t.slice(0, 5000) });
    } else if (m.type === 'image') {
      if (m.url) out.push({ type: 'image', originalContentUrl: abs(m.url), previewImageUrl: abs(m.url) });
    } else if (m.type === 'card') {
      out.push({ type: 'flex', altText: (fillVars(m.card.title, ctx.vars) || '新訊息').slice(0, 300), contents: bubble(m.card, brand, ctx, channelSecret) });
    } else if (m.type === 'carousel') {
      const cards = m.cards.slice(0, 10);
      if (cards.length) {
        out.push({
          type: 'flex',
          altText: (fillVars(cards[0].title, ctx.vars) || '新訊息').slice(0, 300),
          contents: { type: 'carousel', contents: cards.map((c, i) => bubble(c, brand, { ...ctx, trackKey: `${ctx.trackKey}:c${i}` }, channelSecret)) },
        });
      }
    } else if (m.type === 'products') {
      if (!m.productIds.length) continue;
      const { data } = await supabase.from('products').select('id, name, price, original_price, image, images, status').in('id', m.productIds.slice(0, 10));
      const rows = (data ?? []).filter((p) => p.status !== '已下架');
      const sorted = m.productIds.map((id) => rows.find((p) => p.id === id)).filter(Boolean) as typeof rows;
      if (!sorted.length) continue;
      out.push({
        type: 'flex',
        altText: `推薦商品:${sorted[0].name}`.slice(0, 300),
        contents: {
          type: 'carousel',
          contents: sorted.map((p) =>
            bubble(
              {
                image: p.image || p.images?.[0] || '',
                title: p.name,
                body: p.original_price && p.original_price > p.price ? `${formatter.format(p.price)}  原價 ${formatter.format(p.original_price)}` : formatter.format(p.price),
                buttons: [{ label: '查看商品', action: { type: 'url', value: `/products/${encodeURIComponent(p.id)}` } }],
              },
              brand,
              { ...ctx, trackKey: `${ctx.trackKey}:p:${p.id}` },
              channelSecret,
              { aspect: '4:5' },
            ),
          ),
        },
      });
    } else if (m.type === 'coupon') {
      if (!m.couponId) continue;
      const { data: c } = await supabase.from('discounts').select('*').eq('id', m.couponId).maybeSingle();
      if (c) out.push({ type: 'flex', altText: `優惠券:${c.name || c.code}`.slice(0, 300), contents: couponBubble(c as Discount, brand, ctx, channelSecret) });
    } else if (m.type === 'bind') {
      const bindLink = ctx.lineUserId ? bindUrl(createBindToken(ctx.lineUserId, channelSecret)) : `${getConfiguredSiteUrl()}/account`;
      out.push({
        type: 'flex',
        altText: '加入會員 / 綁定帳號',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '18px',
            contents: [
              { type: 'text', text: '綁定官網會員', weight: 'bold', size: 'md', color: '#1f1b19' },
              { type: 'text', text: '第一次來選「新會員」。已經用 Google 或 Email 註冊過的,選「已有官網帳號」。', size: 'sm', wrap: true, color: '#6b6156' },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            paddingAll: '12px',
            contents: [
              { type: 'button', style: 'primary', height: 'sm', color: '#06C755', action: { type: 'uri', label: '新會員 LINE 一鍵加入', uri: `${getConfiguredSiteUrl()}/auth/line/start?next=/account` } },
              { type: 'button', style: 'link', height: 'sm', color: '#6b6156', action: { type: 'uri', label: '已有官網帳號,綁定', uri: bindLink } },
            ],
          },
        },
      });
    }
  }
  const qr = quickReply(set.quickReplies);
  if (qr && out.length) out[out.length - 1] = { ...out[out.length - 1], quickReply: qr };
  return out;
}

// ---------- LINE API ----------
async function lineFetch(path: string, init: RequestInit & { data?: boolean } = {}) {
  const { accessToken } = await getMessagingConfig();
  if (!accessToken) throw new Error('LINE 官方帳號尚未設定(串接設定)');
  const res = await fetch(`${init.data ? DATA_API : API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : {};
  if (!res.ok) throw new Error(json?.message ? `LINE:${json.message}${json.details?.[0]?.message ? `(${json.details[0].message})` : ''}` : `LINE API 錯誤 ${res.status}`);
  return json;
}

export const pushMessages = (to: string, messages: LineMessage[]) => lineFetch('/message/push', { method: 'POST', body: JSON.stringify({ to, messages }) });
export const multicastMessages = (to: string[], messages: LineMessage[]) => lineFetch('/message/multicast', { method: 'POST', body: JSON.stringify({ to, messages }) });
export const broadcastMessages = (messages: LineMessage[]) => lineFetch('/message/broadcast', { method: 'POST', body: JSON.stringify({ messages }) });

export async function getQuota() {
  try {
    const [quota, usage] = await Promise.all([lineFetch('/message/quota'), lineFetch('/message/quota/consumption')]);
    return { type: quota.type as string, limit: quota.type === 'limited' ? Number(quota.value) : null, used: Number(usage.totalUsage ?? 0) };
  } catch (e) {
    return { type: 'error', limit: null, used: 0, error: e instanceof Error ? e.message : '' };
  }
}

export async function getFollowerCount() {
  try {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d).replace(/-/g, '');
    const r = await lineFetch(`/insight/followers?date=${ymd}`);
    return r.status === 'ready' ? { followers: Number(r.followers ?? 0), blocks: Number(r.blocks ?? 0) } : null;
  } catch {
    return null;
  }
}

// ---------- 推播對象 ----------
export async function audienceUserIds(audience: BroadcastAudience): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: members } = await supabase.from('customers').select('user_id, line_user_id, birthday').not('line_user_id', 'is', null);
  const list = (members ?? []) as { user_id: string; line_user_id: string; birthday: string | null }[];
  if (audience === 'members' || audience === 'all') return list.map((m) => m.line_user_id);
  if (audience === 'birthday') {
    const month = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'numeric' }).format(new Date());
    return list.filter((m) => m.birthday && Number(m.birthday.slice(5, 7)) === Number(month)).map((m) => m.line_user_id);
  }
  const ids = list.map((m) => m.user_id);
  if (!ids.length) return [];
  const { data: orders } = await supabase.from('orders').select('user_id, created_at, status').in('user_id', ids);
  const last = new Map<string, number>();
  for (const o of orders ?? []) {
    if (o.status === '已取消') continue;
    const t = new Date(o.created_at).getTime();
    last.set(o.user_id, Math.max(last.get(o.user_id) ?? 0, t));
  }
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  return list
    .filter((m) => {
      const t = last.get(m.user_id);
      if (audience === 'buyers') return Boolean(t);
      if (audience === 'non_buyers') return !t;
      if (audience === 'recent_buyers') return Boolean(t && now - t <= 30 * day);
      if (audience === 'inactive') return Boolean(t && now - t > 90 * day);
      return false;
    })
    .map((m) => m.line_user_id);
}

// 推播不做個人化:變數換成通用稱呼
const BROADCAST_VARS = { LINE名稱: '你', 會員姓名: '你' };

export async function sendBroadcast(id: string) {
  const supabase = createAdminClient();
  const { data: b } = await supabase.from('line_broadcasts').select('*').eq('id', id).maybeSingle();
  if (!b) throw new Error('找不到推播');
  if (b.status === 'sent' || b.status === 'sending') throw new Error('這則推播已經送出');
  await supabase.from('line_broadcasts').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', id);
  try {
    const { config } = await loadBotConfig();
    const messages = await toLineMessages(b.content as MessageSet, { vars: BROADCAST_VARS, trackKey: `broadcast:${id}` }, config.brandColor);
    if (!messages.length) throw new Error('沒有可以傳送的內容');
    let recipients = 0;
    if (b.audience === 'all') {
      await broadcastMessages(messages);
      recipients = (await getFollowerCount())?.followers ?? 0;
    } else {
      const ids = await audienceUserIds(b.audience as BroadcastAudience);
      if (!ids.length) throw new Error('這個對象目前沒有人');
      for (let i = 0; i < ids.length; i += 500) await multicastMessages(ids.slice(i, i + 500), messages);
      recipients = ids.length;
    }
    await supabase.from('line_broadcasts').update({ status: 'sent', sent_at: new Date().toISOString(), recipients, error: '', updated_at: new Date().toISOString() }).eq('id', id);
    await logEvent('broadcast', null, id);
    return recipients;
  } catch (e) {
    const message = e instanceof Error ? e.message : '傳送失敗';
    await supabase.from('line_broadcasts').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', id);
    throw new Error(message);
  }
}

// ---------- 訂單通知(依訂單歷程,排程每 5 分鐘處理) ----------
type HistoryRow = { id: string; order_id: string; type: string; from_status: string | null; to_status: string | null; created_at: string };

function notifyKeyOf(r: HistoryRow): NotifyKey | null {
  const to = r.to_status ?? '';
  const from = r.from_status ?? '';
  if (r.type === 'payment' && to === 'PAID' && from !== 'PAID') return 'paid';
  if (r.type === 'payment' && (to === 'REFUNDED' || to === 'PARTIALLY_REFUNDED')) return 'refunded';
  if (r.type === 'fulfillment' && (to === 'SHIPPED' || to === 'IN_TRANSIT') && from !== 'SHIPPED' && from !== 'IN_TRANSIT') return 'shipped';
  if (r.type === 'fulfillment' && to === 'AT_STORE') return 'at_store';
  if (r.type === 'fulfillment' && (to === 'DELIVERED' || to === 'PICKED_UP')) return 'delivered';
  if (r.type === 'order' && to === 'CANCELLED') return 'cancelled';
  return null;
}

export async function processOrderNotifications() {
  const supabase = createAdminClient();
  const { config, raw } = await loadBotConfig();
  const cursor = typeof raw.notifyCursor === 'string' ? raw.notifyCursor : '';
  if (!cursor) {
    await saveBotConfig({ notifyCursor: new Date().toISOString() });
    return { sent: 0 };
  }
  const { data } = await supabase.from('order_status_history').select('id, order_id, type, from_status, to_status, created_at').gt('created_at', cursor).order('created_at').limit(200);
  const rows = (data ?? []) as HistoryRow[];
  if (!rows.length) return { sent: 0 };
  let sent = 0;
  const done = new Set<string>();
  for (const r of rows) {
    const key = notifyKeyOf(r);
    const rule = key ? config.notify[key] : null;
    const dedupe = `${r.order_id}:${key}`;
    if (!key || !rule?.enabled || done.has(dedupe)) continue;
    done.add(dedupe);
    const { count } = await supabase.from('line_events').select('id', { count: 'exact', head: true }).eq('type', 'notify').eq('key', dedupe);
    if (count) continue;
    const { data: order } = await supabase.from('orders').select('id, user_id, order_no, total, store_name, refund_amount, customer_name').eq('id', r.order_id).maybeSingle();
    if (!order?.user_id) continue;
    const { data: customer } = await supabase.from('customers').select('name, line_user_id').eq('user_id', order.user_id).maybeSingle();
    if (!customer?.line_user_id) continue;
    const { data: ship } = await supabase.from('shipments').select('tracking_number').eq('order_id', order.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const vars = {
      會員姓名: customer.name || order.customer_name || '你',
      LINE名稱: customer.name || '你',
      訂單編號: order.order_no,
      訂單金額: formatter.format(order.total ?? 0),
      取貨門市: order.store_name || '取貨門市',
      物流單號: ship?.tracking_number || '(稍後更新)',
      退款金額: formatter.format(order.refund_amount ?? order.total ?? 0),
    };
    const body = fillVars(rule.text, vars);
    const { channelSecret } = await getMessagingConfig();
    const message: LineMessage = rule.button
      ? {
          type: 'flex',
          altText: body.slice(0, 300),
          contents: {
            type: 'bubble',
            body: { type: 'box', layout: 'vertical', paddingAll: '18px', contents: [{ type: 'text', text: body.slice(0, 1000), wrap: true, size: 'sm', color: '#1f1b19' }] },
            footer: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '12px',
              contents: [{ type: 'button', style: 'primary', height: 'sm', color: config.brandColor, action: { type: 'uri', label: '查看訂單', uri: trackedUrl('/account?tab=orders', `notify:${key}`, channelSecret) } }],
            },
          },
        }
      : { type: 'text', text: body.slice(0, 5000) };
    try {
      await pushMessages(customer.line_user_id, [message]);
      await logEvent('notify', customer.line_user_id, dedupe);
      sent++;
    } catch (e) {
      console.error('LINE notify failed', e);
    }
  }
  await saveBotConfig({ notifyCursor: rows[rows.length - 1].created_at });
  return { sent };
}

// ---------- 圖文選單 ----------
function menuAction(action: BotAction, labelText: string, secret: string, key: string) {
  if (action.type === 'keyword') return { type: 'message', label: label(labelText), text: action.value || label(labelText) };
  const url = action.type === 'page' ? PAGE_OPTIONS.find((p) => p.key === action.value)?.path ?? '/' : action.value || '/';
  return { type: 'uri', label: label(labelText), uri: trackedUrl(url, key, secret) };
}

export async function publishRichMenu(menu: RichMenu) {
  const supabase = createAdminClient();
  const { channelSecret } = await getMessagingConfig();
  const layout = MENU_LAYOUTS.find((l) => l.key === menu.layout);
  if (!layout) throw new Error('格局設定錯誤');
  if (!menu.image_url) throw new Error('請先產生或上傳選單圖片');
  const size = MENU_SIZE[menu.size];
  const created = await lineFetch('/richmenu', {
    method: 'POST',
    body: JSON.stringify({
      size: { width: size.width, height: size.height },
      selected: true,
      name: (menu.name || '選單').slice(0, 300),
      chatBarText: (menu.chat_bar_text || '選單').slice(0, 14),
      areas: layout.areas.map((bounds, i) => {
        const cell = menu.areas[i] ?? { label: '', icon: '', action: { type: 'page' as const, value: 'home' as const } };
        return { bounds, action: menuAction(cell.action, cell.label, channelSecret, `menu:${menu.audience}:${i}`) };
      }),
    }),
  });
  const richMenuId = created.richMenuId as string;
  // 上傳選單圖片
  const img = await fetch(menu.image_url);
  if (!img.ok) throw new Error('讀取選單圖片失敗');
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length > 1024 * 1024) throw new Error('選單圖片需小於 1MB,請重新產生或壓縮');
  await lineFetch(`/richmenu/${richMenuId}/content`, { method: 'POST', data: true, body: bytes, headers: { 'Content-Type': img.headers.get('content-type')?.includes('png') ? 'image/png' : 'image/jpeg' } });

  // 套用:未綁定 → 預設選單;已綁定會員 → 逐一連結到會員
  if (menu.audience === 'guest') {
    await lineFetch(`/user/all/richmenu/${richMenuId}`, { method: 'POST' });
  } else {
    const ids = await audienceUserIds('members');
    for (let i = 0; i < ids.length; i += 500) await lineFetch('/richmenu/bulk/link', { method: 'POST', body: JSON.stringify({ richMenuId, userIds: ids.slice(i, i + 500) }) });
  }

  // 同一對象只保留一個上線中的選單
  const { data: olds } = await supabase.from('line_rich_menus').select('id, line_rich_menu_id').eq('audience', menu.audience).not('line_rich_menu_id', 'is', null);
  for (const o of olds ?? []) {
    if (o.line_rich_menu_id && o.line_rich_menu_id !== richMenuId) {
      await lineFetch(`/richmenu/${o.line_rich_menu_id}`, { method: 'DELETE' }).catch(() => {});
      await supabase.from('line_rich_menus').update({ line_rich_menu_id: null, published_at: null }).eq('id', o.id);
    }
  }
  await supabase.from('line_rich_menus').update({ line_rich_menu_id: richMenuId, published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', menu.id);
  return richMenuId;
}

export async function unpublishRichMenu(menu: RichMenu) {
  const supabase = createAdminClient();
  if (menu.line_rich_menu_id) {
    if (menu.audience === 'guest') await lineFetch('/user/all/richmenu', { method: 'DELETE' }).catch(() => {});
    else {
      const ids = await audienceUserIds('members');
      for (let i = 0; i < ids.length; i += 500) await lineFetch('/richmenu/bulk/unlink', { method: 'POST', body: JSON.stringify({ userIds: ids.slice(i, i + 500) }) }).catch(() => {});
    }
    await lineFetch(`/richmenu/${menu.line_rich_menu_id}`, { method: 'DELETE' }).catch(() => {});
  }
  await supabase.from('line_rich_menus').update({ line_rich_menu_id: null, published_at: null, updated_at: new Date().toISOString() }).eq('id', menu.id);
}

// 綁定 / 解除綁定時切換會員選單
export async function syncMemberMenu(lineUserId: string, bound: boolean) {
  try {
    const { data } = await createAdminClient().from('line_rich_menus').select('line_rich_menu_id').eq('audience', 'member').not('line_rich_menu_id', 'is', null).maybeSingle();
    if (bound && data?.line_rich_menu_id) await lineFetch(`/user/${lineUserId}/richmenu/${data.line_rich_menu_id}`, { method: 'POST' });
    if (!bound) await lineFetch(`/user/${lineUserId}/richmenu`, { method: 'DELETE' });
  } catch {
    /* 選單切換失敗不影響綁定 */
  }
}
