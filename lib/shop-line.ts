// 店家專屬 LINE 官方帳號(店家自己的 Messaging API 金鑰):綁定會員、查詢訂單、訂單通知。
// 與 URBANITE 主站的 LINE(lib/line-messaging、lib/line-bot)完全分開。只能在伺服器端使用。
import { getShopSecret, setShopSecret } from '@/lib/integrations';
import { scopedClient, shopUrl, type Shop } from '@/lib/shop';
import { createBindToken, fetchBotProfile, replyMessage, verifyLineSignature, type LineMessage } from '@/lib/line-messaging';
import type { Order } from '@/lib/types';

export type ShopLineConfig = { channelSecret: string; accessToken: string };
const KIND = 'LINE';
const money = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export const getShopLineConfig = (shopId: string) => getShopSecret<ShopLineConfig>(KIND, shopId);
export const saveShopLineConfig = (shopId: string, cfg: ShopLineConfig | null) => setShopSecret(KIND, shopId, cfg);

// 用 Access token 讀取官方帳號資訊(驗證金鑰是否正確)
export async function fetchBotInfo(accessToken: string) {
  const res = await fetch('https://api.line.me/v2/bot/info', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return (await res.json()) as { displayName?: string; basicId?: string; pictureUrl?: string };
}

async function push(cfg: ShopLineConfig, to: string, messages: LineMessage[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) console.error('shop LINE push failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
}

const QUICK = { items: ['訂單查詢', '綁定'].map((label) => ({ type: 'action', action: { type: 'message', label, text: label } })) };
const text = (t: string): LineMessage => ({ type: 'text', text: t.slice(0, 4900), quickReply: QUICK });

async function boundUserId(shop: Shop, lineUserId: string) {
  const { data } = await scopedClient(shop.id).from('customers').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

function bindLink(shop: Shop, lineUserId: string, cfg: ShopLineConfig) {
  return shopUrl(shop.slug, `/line/bind?t=${encodeURIComponent(createBindToken(lineUserId, cfg.channelSecret))}&openExternalBrowser=1`);
}

async function ordersReply(shop: Shop, userId: string) {
  const { data } = await scopedClient(shop.id).from('orders').select('order_no, status, total, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
  const orders = (data ?? []) as Pick<Order, 'order_no' | 'status' | 'total' | 'created_at'>[];
  if (!orders.length) return '目前沒有訂單紀錄。';
  const lines = orders.map((o) => `${o.order_no}\n${new Date(o.created_at ?? '').toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}・${money(o.total)}\n狀態:${o.status}`);
  return `最近 ${orders.length} 筆訂單\n\n${lines.join('\n\n')}\n\n完整明細:${shopUrl(shop.slug, '/account?tab=orders')}`;
}

type LineEvent = { type: string; replyToken?: string; source?: { type: string; userId?: string }; message?: { type: string; text?: string } };

// 店家 LINE Webhook:加好友歡迎、輸入「綁定」取得綁定連結、「訂單查詢」;其他訊息不自動回覆(留給店家真人回覆)
export async function handleShopWebhook(shop: Shop, raw: string, signature: string | null) {
  const cfg = await getShopLineConfig(shop.id);
  if (!cfg) return { status: 503, body: { error: '這家店還沒連接 LINE 官方帳號' } };
  if (!verifyLineSignature(raw, signature, cfg.channelSecret)) return { status: 401, body: { error: 'invalid signature' } };
  const events = ((JSON.parse(raw || '{}') as { events?: LineEvent[] }).events ?? []);
  await Promise.all(events.map(async (event) => {
    const lineUserId = event.source?.userId;
    if (!lineUserId || event.source?.type !== 'user' || !event.replyToken) return;
    const reply = (t: string) => replyMessage(event.replyToken!, [text(t)], cfg.accessToken);
    try {
      const userId = await boundUserId(shop, lineUserId);
      if (event.type === 'follow') {
        return reply(userId
          ? `歡迎回來 ${shop.name}!訂單成立、出貨都會在這裡通知你。輸入「訂單查詢」可以查看最近的訂單。`
          : `歡迎加入 ${shop.name}!\n\n綁定官網會員後,訂單成立、出貨都會在這裡通知你:\n${bindLink(shop, lineUserId, cfg)}`);
      }
      if (event.type !== 'message' || event.message?.type !== 'text') return;
      const input = (event.message.text ?? '').trim();
      if (input === '綁定') {
        return reply(userId ? '你已經綁定官網會員了。' : `點下面的連結登入官網,完成綁定(30 分鐘內有效):\n${bindLink(shop, lineUserId, cfg)}`);
      }
      if (/訂單/.test(input)) {
        return reply(userId ? await ordersReply(shop, userId) : `查詢訂單前,要先綁定官網會員:\n${bindLink(shop, lineUserId, cfg)}`);
      }
    } catch (error) {
      console.error('shop LINE event failed', error);
    }
  }));
  return { status: 200, body: { ok: true } };
}

// 綁定:把 LINE userId 綁到這家店的會員資料(customers 依店家分開)
export async function bindShopLine(shop: Shop, cfg: ShopLineConfig, userId: string, email: string, lineUserId: string) {
  const supabase = scopedClient(shop.id);
  const { data: mine } = await supabase.from('customers').select('user_id').eq('user_id', userId).maybeSingle();
  if (!mine) await supabase.from('customers').insert({ user_id: userId, email, name: '', phone: '' });
  const owner = await boundUserId(shop, lineUserId);
  if (owner && owner !== userId) throw new Error('這個 LINE 已綁定其他會員帳號,請先用該帳號解除綁定');
  const profile = await fetchBotProfile(lineUserId, cfg.accessToken).catch(() => null);
  const { error } = await supabase.from('customers').update({
    line_user_id: lineUserId,
    line_display_name: profile?.displayName ?? '',
    line_picture_url: profile?.pictureUrl ?? '',
    line_bound_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (error) throw new Error(error.message);
  await push(cfg, lineUserId, [text(`綁定完成!之後在 ${shop.name} 的訂單成立、出貨都會在這裡通知你。`)]);
  return profile;
}

// 訂單通知:成立 / 出貨。沒設定 LINE 或買家沒綁定就略過
export async function notifyShopOrder(shop: Shop, orderId: string, kind: 'created' | 'shipped', detail = '') {
  const cfg = await getShopLineConfig(shop.id);
  if (!cfg) return;
  const supabase = scopedClient(shop.id);
  const { data: order } = await supabase.from('orders').select('order_no, total, user_id, payment_method').eq('id', orderId).maybeSingle();
  if (!order?.user_id) return;
  const { data: customer } = await supabase.from('customers').select('line_user_id').eq('user_id', order.user_id).maybeSingle();
  if (!customer?.line_user_id) return;
  const link = shopUrl(shop.slug, '/account?tab=orders');
  const body = kind === 'created'
    ? `訂單成立通知\n\n訂單編號:${order.order_no}\n金額:${money(order.total)}\n付款方式:${order.payment_method ?? ''}\n\n查看訂單:${link}`
    : `出貨通知\n\n訂單編號:${order.order_no} 已出貨${detail ? `\n${detail}` : ''}\n\n查看訂單:${link}`;
  await push(cfg, customer.line_user_id as string, [text(body)]);
}
