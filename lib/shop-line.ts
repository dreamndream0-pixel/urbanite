// 店家專屬 LINE 官方帳號(店家自己的 Messaging API 金鑰):綁定會員、查詢訂單、訂單通知。
// 與 URBANITE 主站的 LINE(lib/line-messaging、lib/line-bot)完全分開。只能在伺服器端使用。
import { getShopSecret, setShopSecret } from '@/lib/integrations';
import { scopedClient, shopUrl, type Shop } from '@/lib/shop';
import { createBindToken, fetchBotProfile, replyMessage, verifyLineSignature, type LineMessage } from '@/lib/line-messaging';
import type { Order } from '@/lib/types';
import { getOrderNotificationConfig } from '@/lib/order-notification-config';
import { orderFlexMessage } from '@/lib/order-flex';
import { runAsShop } from '@/lib/line-channel';

export type ShopLineConfig = { channelSecret: string; accessToken: string; loginChannelId?: string; loginChannelSecret?: string };
const KIND = 'LINE';

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
  const { data, error } = await scopedClient(shop.id).from('customers').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (error) throw new Error('無法讀取 LINE 綁定狀態');
  return (data?.user_id as string | undefined) ?? null;
}

function bindLink(shop: Shop, lineUserId: string, cfg: ShopLineConfig) {
  return shopUrl(shop.slug, `/line/bind?t=${encodeURIComponent(createBindToken(lineUserId, cfg.channelSecret))}&openExternalBrowser=1`);
}

// 訂單查詢:最近 5 筆訂單,以 Flex 卡片輪播呈現
async function ordersReply(shop: Shop, userId: string): Promise<LineMessage> {
  const { data } = await scopedClient(shop.id).from('orders').select('order_no, status, total, created_at, items, payment_method, shipping_method, store_name').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
  const orders = (data ?? []) as Order[];
  if (!orders.length) return text('目前沒有訂單紀錄。');
  const link = shopUrl(shop.slug, '/account?tab=orders');
  const bubbles = orders.map((o) => orderFlexMessage({
    shopName: shop.name, order: o, link,
    title: o.status || '訂單',
    subtitle: `下單日期 ${new Date(o.created_at ?? '').toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
  }).contents);
  return { type: 'flex', altText: `最近 ${orders.length} 筆訂單`, contents: { type: 'carousel', contents: bubbles }, quickReply: QUICK } as unknown as LineMessage;
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
        if (userId) return replyMessage(event.replyToken!, [await ordersReply(shop, userId)], cfg.accessToken);
        return reply(`查詢訂單前,要先綁定官網會員:\n${bindLink(shop, lineUserId, cfg)}`);
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
  const { data: mine, error: lookupError } = await supabase.from('customers').select('user_id').eq('user_id', userId).maybeSingle();
  if (lookupError) throw new Error('無法讀取會員資料');
  if (!mine) {
    const { error: insertError } = await supabase.from('customers').insert({ user_id: userId, email, name: '', phone: '' });
    if (insertError) throw new Error('無法建立會員資料，請重新訂閱');
  }
  const owner = await boundUserId(shop, lineUserId);
  if (owner && owner !== userId) throw new Error('這個 LINE 已綁定其他會員帳號,請先用該帳號解除綁定');
  const profile = await fetchBotProfile(lineUserId, cfg.accessToken).catch(() => null);
  const { data: updated, error } = await supabase.from('customers').update({
    line_user_id: lineUserId,
    line_display_name: profile?.displayName ?? '',
    line_picture_url: profile?.pictureUrl ?? '',
    line_bound_at: new Date().toISOString(),
  }).eq('user_id', userId).select('user_id').single();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error('會員綁定未完成，請重新訂閱');
  // 有上線中的會員圖文選單時,換成會員選單(失敗不影響綁定)
  await runAsShop(shop, async () => (await import('@/lib/line-bot')).syncMemberMenu(lineUserId, true)).catch(() => {});
  await push(cfg, lineUserId, [text(`綁定完成!之後在 ${shop.name} 的訂單成立、出貨都會在這裡通知你。`)]).catch(() => console.error('shop LINE binding confirmation unavailable'));
  return profile;
}

// 訂單通知:成立 / 出貨。沒設定 LINE 或買家沒綁定就略過
export async function notifyShopOrder(shop: Shop, orderId: string, kind: 'created' | 'shipped', detail = '') {
  if (await getOrderNotificationConfig(shop.id)) return;
  const cfg = await getShopLineConfig(shop.id);
  if (!cfg) return;
  const supabase = scopedClient(shop.id);
  const { data: order } = await supabase.from('orders').select('order_no, total, user_id, payment_method, shipping_method, store_name, items').eq('id', orderId).maybeSingle();
  if (!order?.user_id) return;
  const { data: customer } = await supabase.from('customers').select('line_user_id').eq('user_id', order.user_id).maybeSingle();
  if (!customer?.line_user_id) return;
  const link = shopUrl(shop.slug, '/account?tab=orders');
  const card = orderFlexMessage({
    shopName: shop.name, order, link,
    title: kind === 'created' ? '下單成立' : '已出貨',
    subtitle: kind === 'created' ? '感謝您的訂購,我們已收到訂單。' : '商品已出貨,請留意配送進度。',
    extra: kind === 'shipped' && detail ? [['出貨資訊', detail]] : [],
    event: kind,
  });
  await push(cfg, customer.line_user_id as string, [card as unknown as LineMessage]);
}
