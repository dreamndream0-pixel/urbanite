import { createAdminClient } from '@/lib/supabase/admin';
import { getIntegrations } from '@/lib/integrations';
import { getOrderNotificationConfig } from '@/lib/order-notification-config';
import { noticeEnabled, ORDER_NOTICE_EVENTS, type OrderNoticeEvent, type NoticeAudience, type NoticeChannel } from '@/lib/order-notification-settings';
import { getMessagingConfig } from '@/lib/line-messaging';
import { getShopLineConfig } from '@/lib/shop-line';
import { orderEmailHtml, orderNoticeEmailHtml, sellerRecipients, shopLineUrl, transferBlock } from '@/lib/order-email';
import { shopUrl, URBANITE_SHOP_ID } from '@/lib/shop';
import type { Order } from '@/lib/types';
import { orderFlexMessage } from '@/lib/order-flex';

// LINE 卡片上的說明文字
const BUYER_TEXT: Partial<Record<OrderNoticeEvent, string>> = {
  created: '感謝您的訂購,我們已收到訂單。', ready: '商品正在準備出貨。', shipped: '商品已出貨,請留意配送進度。',
  paid: '已確認收到您的款項。', arrived: '商品已送達,請記得取貨。', picked_up: '已完成取貨,感謝您的購買。',
  completed: '訂單已完成,期待再次為您服務。', cancelled: '您的訂單已取消。', refunded: '退款已處理。', return_requested: '已收到您的退貨申請,我們會盡快處理。',
  payment_reported: '已收到您的付款通知,我們確認款項後會盡快出貨。',
  cancel_requested: '已收到您的取消申請,我們會盡快處理並通知您結果。',
};
const SELLER_TEXT: Partial<Record<OrderNoticeEvent, string>> = {
  created: '有一筆新訂單,請盡快處理。', paid: '買家已付款。', return_requested: '買家提出退貨申請,請到後台處理。', cancelled: '訂單已取消。',
  payment_reported: '買家已通知付款,請核對款項後標記已付款。',
  cancel_requested: '買家申請取消訂單,請到後台審核。',
};


type Payload = { body: Record<string, unknown>; endpoint: 'email' | 'push' | 'multicast' };
type Job = {
  id: string; shop_id: string; order_id: string; event: OrderNoticeEvent;
  audience: NoticeAudience; channel: NoticeChannel; attempts: number; lease_token: string;
  first_send_at: string | null; created_at: string; payload: Payload | null;
};
const emails = (values: string[]) => [...new Set(values.map(s => s.trim().toLowerCase()).filter(s => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)))];
class NoticeError extends Error {
  constructor(message: string, public retry = false, public skip = false) { super(message); }
}

async function prepare(job: Job, sender: string, notify: string): Promise<Payload> {
  const db = createAdminClient();
  const { data: shop, error: shopError } = await db.from('shops').select('id,name,slug,status').eq('id', job.shop_id).single();
  const { data, error } = await db.from('orders').select('*').eq('shop_id', job.shop_id).eq('id', job.order_id).single();
  if (error || shopError) throw new NoticeError('無法讀取訂單或商店', true);
  if (shop.status === 'suspended') throw new NoticeError('商店已停用', false, true);
  const order = data as Order;
  const platform = job.shop_id === URBANITE_SHOP_ID;
  const label = ORDER_NOTICE_EVENTS.find(e => e.key === job.event)!.label;
  const site = shopUrl(shop.slug, '').replace(/\/$/, '');
  // 訪客訂單沒有會員中心,買家連結改到「訪客查詢訂單」
  const guestBuyer = job.audience === 'buyer' && !order.user_id;
  const link = `${site}${job.audience === 'seller' ? '/admin' : guestBuyer ? `/order-lookup?no=${encodeURIComponent(order.order_no)}` : '/account?tab=orders'}`;
  const subject = `【${shop.name}】${label} ${order.order_no}`;
  const sellerEmails = job.audience === 'seller' ? emails(await sellerRecipients(shop, platform, notify)) : [];
  // 補充欄位:Email 與 LINE 共用
  const extra: [string, string][] = [];
  if (job.event === 'payment_reported') {
    if (order.payment_ref) extra.push(['帳號後五碼', String(order.payment_ref)]);
    if (order.payment_proof_note) extra.push(['備註', String(order.payment_proof_note)]);
    if (order.payment_proof_url) extra.push(['付款截圖', '已附上(請到後台查看)']);
  }
  if (job.event === 'cancel_requested' && order.cancel_reason) extra.push(['取消原因', String(order.cancel_reason)]);
  if (['shipped', 'arrived', 'ready'].includes(job.event)) {
    const { data: ship } = await db.from('shipments').select('carrier,tracking_number').eq('order_id', order.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (ship?.carrier) extra.push(['物流', String(ship.carrier)]);
    if (ship?.tracking_number) extra.push(['物流單號', String(ship.tracking_number)]);
  }
  const seller = job.audience === 'seller';
  const title = seller && job.event === 'created' ? '新訂單' : seller && job.event === 'payment_reported' ? '買家已通知付款' : seller && job.event === 'cancel_requested' ? '買家申請取消' : label;
  const subtitle = (seller ? SELLER_TEXT : BUYER_TEXT)[job.event];
  const buttonLabel = seller ? '到後台處理' : guestBuyer ? '查詢訂單' : '查看訂單';
  if (job.channel === 'email') {
    const to = job.audience === 'buyer' ? emails([order.email]) : sellerEmails;
    if (!to.length) throw new NoticeError('未設定有效的收件信箱', false, true);
    const lineUrl = job.audience === 'buyer' ? await shopLineUrl(job.shop_id).catch(() => '') : '';
    let html = orderNoticeEmailHtml({ order, shopName: shop.name, title, subtitle, link, buttonLabel, rows: extra, lineUrl });
    if (job.event === 'created') {
      let transfer = '';
      if (/轉帳|匯款/.test(order.payment_method ?? '')) {
        const { data: settings, error: settingsError } = await db.from('site_settings').select('payment_accounts').eq('shop_id', job.shop_id).maybeSingle();
        if (settingsError) throw new NoticeError('無法讀取匯款資訊', true);
        const account = (settings?.payment_accounts as { name: string; info: string }[] | null)?.find(a => a.name === order.payment_method)?.info;
        if (account) transfer = transferBlock(account);
      }
      html = orderEmailHtml(order, shop.name, transfer, !!order.user_id, site, lineUrl)[job.audience];
    }
    return { endpoint: 'email', body: { from: `${String(shop.name).replace(/[<>"\r\n]/g, '')} <${sender}>`, to, subject, html } };
  }
  let ids: string[] = [];
  if (job.audience === 'buyer' && order.user_id) {
    const { data: customer, error: e } = await db.from('customers').select('line_user_id').eq('shop_id', job.shop_id).eq('user_id', order.user_id).maybeSingle();
    if (e) throw new NoticeError('無法讀取 LINE 綁定', true);
    ids = customer?.line_user_id ? [customer.line_user_id] : [];
  } else if (job.audience === 'seller') {
    // Seller LINE bindings are resolved only within this shop, never across bot channels.
    let query = db.from('customers').select('line_user_id').eq('shop_id', job.shop_id);
    if (platform) {
      if (!sellerEmails.length) throw new NoticeError('未設定賣家通知帳號', false, true);
      query = query.in('email', sellerEmails);
    } else {
      const { data: owners, error: e } = await db.from('shop_members').select('user_id').eq('shop_id', job.shop_id).eq('role', 'owner');
      if (e) throw new NoticeError('無法讀取店主帳號', true);
      if (!owners?.length) throw new NoticeError('未設定店主', false, true);
      query = query.in('user_id', owners.map(o => o.user_id));
    }
    const { data: customers, error: e } = await query;
    if (e) throw new NoticeError('無法讀取賣家 LINE 綁定', true);
    ids = (customers ?? []).map(c => c.line_user_id).filter(Boolean);
  }
  ids = [...new Set(ids)];
  if (!ids.length) throw new NoticeError('收件人尚未綁定本商店 LINE', false, true);
  if (ids.length > 500) throw new NoticeError('LINE 收件人超過上限');
  const messages = [orderFlexMessage({ shopName: shop.name, title, subtitle, order, link, extra, buttonLabel, event: job.event })];
  return ids.length === 1 ? { endpoint: 'push', body: { to: ids[0], messages } } : { endpoint: 'multicast', body: { to: ids, messages } };
}

export async function processOrderNotificationQueue() {
  const db = createAdminClient();
  const started = Date.now();
  const result = { sent: 0, skipped: 0, failed: 0, retried: 0 };
  // Claim individually so a slow provider cannot strand a large batch beyond the cron time budget.
  for (let i = 0; i < 60 && Date.now() - started < 38_000; i++) {
    const { data, error } = await db.rpc('claim_order_notifications', { p_limit: 1 });
    if (error) throw new Error('訂單通知資料庫尚未就緒或無法讀取');
    const job = (data as Job[] | null)?.[0];
    if (!job) break;
    const update = async (patch: Record<string, unknown>) => {
      const { data: rows, error: e } = await db.from('order_notification_jobs').update(patch).eq('id', job.id).eq('lease_token', job.lease_token).select('id');
      if (e || !rows?.length) throw new Error('Notification lease lost');
    };
    try {
      const config = await getOrderNotificationConfig(job.shop_id);
      if (!config || new Date(job.created_at).getTime() < new Date(config.since).getTime() || !noticeEnabled(config.settings, job.event, job.audience, job.channel)) {
        throw new NoticeError('此事件或通知管道未啟用', false, true);
      }
      // Both providers retain idempotency keys for 24h. Never retry an ambiguous send after that horizon.
      if (job.first_send_at && Date.now() - new Date(job.first_send_at).getTime() >= 23 * 3600_000) throw new NoticeError('已超過安全重試時間，請至供應商後台確認');
      const cfg = await getIntegrations(['RESEND_API_KEY', 'EMAIL_FROM', 'ORDER_NOTIFY_EMAILS'] as const);
      const token = job.channel === 'email' ? cfg.RESEND_API_KEY : (job.shop_id === URBANITE_SHOP_ID ? await getMessagingConfig() : await getShopLineConfig(job.shop_id))?.accessToken;
      if (!token || (job.channel === 'email' && !emails([cfg.EMAIL_FROM]).length)) throw new NoticeError('尚未完成通知管道串接');
      const payload = job.payload ?? await prepare(job, cfg.EMAIL_FROM, cfg.ORDER_NOTIFY_EMAILS);
      await update({ payload, first_send_at: job.first_send_at ?? new Date().toISOString() });
      const response = await fetch(payload.endpoint === 'email' ? 'https://api.resend.com/emails' : `https://api.line.me/v2/bot/message/${payload.endpoint}`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(job.channel === 'email' ? { 'Idempotency-Key': job.id } : { 'X-Line-Retry-Key': job.id }) },
        body: JSON.stringify(payload.body),
      });
      const acceptedRetry = job.channel === 'line' && response.status === 409 && !!response.headers.get('x-line-accepted-request-id');
      if (!response.ok && !acceptedRetry) throw new NoticeError(`供應商回應 HTTP ${response.status}`, response.status >= 500 || response.status === 429);
      await update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null, lease_until: null });
      result.sent++;
    } catch (error) {
      const known = error instanceof NoticeError;
      const skip = known && error.skip;
      const retry = !skip && (!known || error.retry) && job.attempts < 6;
      await update({ status: skip ? 'skipped' : retry ? 'pending' : 'failed', last_error: known ? error.message : '暫時無法發送，請檢查連線或設定', lease_until: null,
        available_at: new Date(Date.now() + Math.min(3600, 60 * 2 ** job.attempts) * 1000).toISOString() });
      result[skip ? 'skipped' : retry ? 'retried' : 'failed']++;
    }
  }
  return result;
}

// 不經佇列、直接發送(資料庫 trigger 不涵蓋的事件,例如退貨申請)。依店家通知設定決定收件對象與管道。
export async function sendOrderNoticeNow(shopId: string, orderId: string, event: OrderNoticeEvent) {
  const config = await getOrderNotificationConfig(shopId);
  const cfg = await getIntegrations(['RESEND_API_KEY', 'EMAIL_FROM', 'ORDER_NOTIFY_EMAILS'] as const);
  const lineToken = (shopId === URBANITE_SHOP_ID ? await getMessagingConfig() : await getShopLineConfig(shopId))?.accessToken;
  const tasks = (['buyer', 'seller'] as const).flatMap(audience => (['email', 'line'] as const).map(async channel => {
    if (config && !noticeEnabled(config.settings, event, audience, channel)) return;
    const token = channel === 'email' ? cfg.RESEND_API_KEY : lineToken;
    if (!token || (channel === 'email' && !emails([cfg.EMAIL_FROM]).length)) return;
    const job = { id: crypto.randomUUID(), shop_id: shopId, order_id: orderId, event, audience, channel, attempts: 0, lease_token: '', first_send_at: null, created_at: new Date().toISOString(), payload: null };
    try {
      const payload = await prepare(job, cfg.EMAIL_FROM, cfg.ORDER_NOTIFY_EMAILS);
      const response = await fetch(payload.endpoint === 'email' ? 'https://api.resend.com/emails' : `https://api.line.me/v2/bot/message/${payload.endpoint}`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      if (!response.ok) console.error('order notice failed', event, audience, channel, response.status);
    } catch (error) {
      if (!(error instanceof NoticeError && error.skip)) console.error('order notice failed', event, audience, channel, error instanceof Error ? error.message : error);
    }
  }));
  await Promise.allSettled(tasks);
}
