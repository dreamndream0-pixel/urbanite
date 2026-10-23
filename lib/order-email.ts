// 下單通知信:買家一封(訂單確認)、賣家一封(新訂單通知)。透過 Resend 寄送,只能在伺服器端使用。
// 沒設定 RESEND_API_KEY / EMAIL_FROM 時直接略過,不影響下單。
import { getAdminEmails, getIntegrations } from '@/lib/integrations';
import { createAdminClient } from '@/lib/supabase/admin';
import { isOnlinePayment } from '@/lib/payment';
import type { Order } from '@/lib/types';
import { getOrderNotificationConfig } from '@/lib/order-notification-config';
import { getCheckoutLine, lineAddFriendUrl } from '@/lib/checkout-line';
import { URBANITE_SHOP_ID } from '@/lib/shop';
import type { SiteSettings } from '@/lib/types';

type Shop = { id: string; name: string; slug: string } | null;
type Ctx = { order: Order; shop: Shop; platform: boolean; siteUrl: string; member: boolean };

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const money = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const isEmail = (v: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);

async function send(key: string, from: string, to: string[], subject: string, html: string, replyTo?: string) {
  const list = [...new Set(to.map((t) => t.trim().toLowerCase()).filter(isEmail))];
  if (!list.length) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: list, subject, html, ...(replyTo && isEmail(replyTo) ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) console.error('order email failed', res.status, (await res.text()).slice(0, 300));
}

// 賣家收件人:主站 → 後台設定的通知信箱(沒填用管理員);店家 → 店主的帳號信箱
export async function sellerRecipients(shop: Shop, platform: boolean, notify: string): Promise<string[]> {
  if (platform) {
    const list = notify.split(',').map((s) => s.trim()).filter(Boolean);
    return list.length ? list : await getAdminEmails().catch(() => []);
  }
  if (!shop) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from('shop_members').select('user_id').eq('shop_id', shop.id).eq('role', 'owner');
  if (error) throw new Error('Unable to resolve shop owner');
  const emails: string[] = [];
  for (const row of data ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(String(row.user_id));
    if (u.user?.email) emails.push(u.user.email);
  }
  return emails;
}

function orderTable(order: Order) {
  const thumb = (src?: string) => (src && /^https:\/\//.test(src) ? `<img src="${esc(src)}" width="52" height="52" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:10px;background:#f2f2f2">` : '');
  const rows = (order.items ?? []).map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><table style="border-collapse:collapse"><tr><td style="padding:0;vertical-align:middle">${thumb(i.image)}</td><td style="padding:0;vertical-align:middle">${esc(i.name)}${i.variant ? `<br><span style="color:#8a7f72;font-size:12px">${esc(i.variant)}</span>` : ''}</td></tr></table></td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">× ${i.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${money(i.price * i.quantity)}</td></tr>`).join('');
  const line = (label: string, value: string, bold = false) => `<tr><td colspan="2" style="padding:4px 0;color:#6b6156">${label}</td><td style="padding:4px 0;text-align:right;${bold ? 'font-weight:700;font-size:16px' : ''}">${value}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    ${line('小計', money(order.subtotal))}
    ${line('運費', money(order.shipping))}
    ${order.discount ? line('折扣', `-${money(order.discount)}`) : ''}
    ${order.credit_used ? line('回饋金折抵', `-${money(order.credit_used)}`) : ''}
    ${line('總計', money(order.total), true)}</table>`;
}

function delivery(order: Order) {
  const store = order.store_name ? `${esc(order.store_name)}${order.store_id && order.store_id !== 'MANUAL' ? `(${esc(order.store_id)})` : ''}${order.store_address ? `<br>${esc(order.store_address)}` : ''}` : '';
  return `<p style="margin:4px 0"><b>付款方式:</b>${esc(order.payment_method)}</p>
    <p style="margin:4px 0"><b>配送方式:</b>${esc(order.shipping_method)}</p>
    ${store ? `<p style="margin:4px 0"><b>取貨門市:</b>${store}</p>` : order.address ? `<p style="margin:4px 0"><b>收件地址:</b>${esc(order.address)}</p>` : ''}
    <p style="margin:4px 0"><b>收件人:</b>${esc(order.customer_name)} ${esc(order.phone ?? '')}</p>
    ${(order.custom_fields ?? []).map((cf) => `<p style="margin:4px 0"><b>${esc(cf.label)}:</b>${esc(cf.value)}</p>`).join('')}
    ${order.note ? `<p style="margin:4px 0"><b>備註:</b>${esc(order.note)}</p>` : ''}`;
}

// 買家信件底部:訪客的「查詢訂單」與「訂閱官方 LINE」按鈕
const button = (href: string, label: string, bg = '#1f1b19') => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px;margin:0 8px 8px 0">${esc(label)}</a>`;
export function buyerExtras(order: Order, siteUrl: string, lineUrl: string, member: boolean) {
  const lookup = member ? '' : `<div style="margin:20px 0 0;padding:12px 14px;background:#faf7f2;border-radius:8px;font-size:13px;color:#6b6156">訪客訂單可隨時查詢:輸入訂單編號 <b>${esc(order.order_no)}</b> 與下單時的手機或 Email。<br>${button(`${siteUrl}/order-lookup?no=${encodeURIComponent(order.order_no)}`, '查詢訂單')}</div>`;
  const line = lineUrl ? `<div style="margin:16px 0 0;padding:12px 14px;background:#f3fbf5;border-radius:8px;font-size:13px;color:#3d5a45">加入官方 LINE,查詢出貨進度、聯絡客服更方便。<br>${button(lineUrl, '訂閱官方 LINE', '#06C755')}</div>` : '';
  return lookup + line;
}

// 這家店結帳頁設定的官方 LINE(系統設定 → 頁尾 → 結帳頁 LINE 設定);沒設定回空字串
export async function shopLineUrl(shopId: string) {
  const { data } = await createAdminClient().from('site_settings').select('footer_sections').eq('shop_id', shopId).maybeSingle();
  return lineAddFriendUrl(getCheckoutLine(data as Pick<SiteSettings, 'footer_sections'> | null));
}

const frame = (shopName: string, body: string) => `<div style="background:#f6f2ec;padding:24px 12px;font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;color:#1f1b19">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px 24px">
  <p style="margin:0 0 16px;font-size:18px;font-weight:700;letter-spacing:.08em">${esc(shopName)}</p>${body}</div></div>`;

export async function sendOrderEmails({ order, shop, platform, siteUrl, member }: Ctx) {
  if (shop && await getOrderNotificationConfig(shop.id)) return;
  const cfg = await getIntegrations(['RESEND_API_KEY', 'EMAIL_FROM', 'ORDER_NOTIFY_EMAILS'] as const);
  if (!cfg.RESEND_API_KEY || !isEmail(cfg.EMAIL_FROM)) return;
  const shopName = shop?.name || 'URBANITE';
  const from = `${shopName.replace(/[<>"]/g, '')} <${cfg.EMAIL_FROM}>`;
  const sellers = await sellerRecipients(shop, platform, cfg.ORDER_NOTIFY_EMAILS);

  // 轉帳匯款:附上收款帳號,方便買家直接匯款
  let transfer = '';
  if (!isOnlinePayment(order.payment_method ?? '') && /轉帳|匯款/.test(order.payment_method ?? '')) {
    const q = createAdminClient().from('site_settings').select('payment_accounts');
    const { data } = await (shop ? q.eq('shop_id', shop.id) : q).maybeSingle();
    const account = (data?.payment_accounts as { name: string; info: string }[] | null)?.find((a) => a.name === order.payment_method)?.info;
    if (account) transfer = transferBlock(account);
  }

  const lineUrl = await shopLineUrl(shop?.id ?? URBANITE_SHOP_ID).catch(() => '');
  const { buyer, seller } = orderEmailHtml(order, shopName, transfer, member, siteUrl, lineUrl);
  await Promise.allSettled([
    send(cfg.RESEND_API_KEY, from, [order.email], `【${shopName}】訂單成立通知 ${order.order_no}`, buyer, sellers[0]),
    send(cfg.RESEND_API_KEY, from, sellers, `【新訂單】${order.order_no} ${money(order.total)}`, seller, order.email),
  ]);
}

// 信件內容(純函式,方便預覽)
export function orderEmailHtml(order: Order, shopName: string, transfer: string, member: boolean, siteUrl: string, lineUrl = '') {
  const buyerBody = `<p style="margin:0 0 8px;font-size:16px">${esc(order.customer_name)} 您好,感謝您的訂購!</p>
    <p style="margin:0 0 16px;color:#6b6156;font-size:14px">我們已收到您的訂單,訂單編號 <b>${esc(order.order_no)}</b>。</p>
    ${transfer}${orderTable(order)}<div style="margin-top:16px;font-size:14px">${delivery(order)}</div>
    ${member ? `<p style="margin:20px 0 0"><a href="${esc(siteUrl)}/account" style="display:inline-block;background:#1f1b19;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px">查看訂單</a></p>` : ''}
    ${buyerExtras(order, siteUrl, lineUrl, member)}`;
  const sellerBody = `<p style="margin:0 0 8px;font-size:16px">您有一筆新訂單</p>
    <p style="margin:0 0 16px;color:#6b6156;font-size:14px">訂單編號 <b>${esc(order.order_no)}</b>,買家 ${esc(order.customer_name)}(${esc(order.email)})。</p>
    ${orderTable(order)}<div style="margin-top:16px;font-size:14px">${delivery(order)}</div>
    <p style="margin:20px 0 0"><a href="${esc(siteUrl)}/admin" style="display:inline-block;background:#1f1b19;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px">到後台處理訂單</a></p>`;

  return { buyer: frame(shopName, buyerBody), seller: frame(shopName, sellerBody) };
}

// 訂單狀態通知信(出貨、到貨、取消、退貨、已通知付款…):標題、說明、商品圖與明細、配送資訊、補充欄位、按鈕
export function orderNoticeEmailHtml({ order, shopName, title, subtitle, link, buttonLabel, rows = [], lineUrl = '' }: { order: Order; shopName: string; title: string; subtitle?: string; link: string; buttonLabel: string; rows?: [string, string][]; lineUrl?: string }) {
  const extra = rows.filter(([, v]) => v).map(([k, v]) => `<p style="margin:4px 0"><b>${esc(k)}:</b>${esc(v)}</p>`).join('');
  const body = `<p style="margin:0 0 4px;font-size:18px;font-weight:700">${esc(title)}</p>
    <p style="margin:0 0 16px;color:#6b6156;font-size:14px">訂單編號 <b>${esc(order.order_no)}</b>${subtitle ? `<br>${esc(subtitle)}` : ''}</p>
    ${extra ? `<div style="margin:0 0 16px;padding:12px 14px;background:#faf7f2;border-radius:8px;font-size:14px">${extra}</div>` : ''}
    ${orderTable(order)}<div style="margin-top:16px;font-size:14px">${delivery(order)}</div>
    <p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#1f1b19;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px">${esc(buttonLabel)}</a></p>
    ${lineUrl ? `<div style="margin:16px 0 0;padding:12px 14px;background:#f3fbf5;border-radius:8px;font-size:13px;color:#3d5a45">加入官方 LINE,查詢出貨進度、聯絡客服更方便。<br>${button(lineUrl, '訂閱官方 LINE', '#06C755')}</div>` : ''}`;
  return frame(shopName, body);
}

export function transferBlock(account: string) {
  return `<div style="margin:16px 0;padding:12px 14px;background:#faf7f2;border-radius:8px;font-size:14px"><b>匯款資訊</b><br><span style="white-space:pre-line">${esc(account)}</span><br><span style="color:#8a7f72;font-size:12px">匯款後請回報帳號後五碼:會員到「我的訂單」,訪客可在下方「查詢訂單」回報。</span></div>`;
}
