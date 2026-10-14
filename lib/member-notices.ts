// 會員通知(非訂單):回饋金入帳、回饋金即將到期、會員升級。Email(Resend)+ LINE 卡片,依「系統設定 → 通知」買家欄位。
import { createAdminClient } from '@/lib/supabase/admin';
import { getIntegrations } from '@/lib/integrations';
import { getOrderNotificationConfig } from '@/lib/order-notification-config';
import { noticeEnabled, type OrderNoticeEvent } from '@/lib/order-notification-settings';
import { getMessagingConfig } from '@/lib/line-messaging';
import { getShopLineConfig } from '@/lib/shop-line';
import { scopedClient, shopUrl, URBANITE_SHOP_ID } from '@/lib/shop';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { noticeBubble } from '@/lib/line-flex-templates';

type MemberEvent = Extract<OrderNoticeEvent, 'credit_earned' | 'credit_expiring' | 'tier_up'>;
export type MemberNotice = { title: string; highlight: string; subtitle: string; rows?: [string, string][] };

const STYLE: Record<MemberEvent, { icon: string; color: string; button: string }> = {
  credit_earned: { icon: 'gift', color: '#2e9e5b', button: '查看回饋金' },
  credit_expiring: { icon: 'hourglass', color: '#e8732e', button: '去購物使用' },
  tier_up: { icon: 'crown', color: '#a8802f', button: '查看會員權益' },
};
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function sendMemberNotice(shopId: string, userId: string, event: MemberEvent, notice: MemberNotice) {
  const config = await getOrderNotificationConfig(shopId);
  const want = (channel: 'email' | 'line') => !config || noticeEnabled(config.settings, event, 'buyer', channel);
  const { data: shop } = await createAdminClient().from('shops').select('id, name, slug, status').eq('id', shopId).maybeSingle();
  if (!shop || shop.status === 'suspended') return;
  const site = shopId === URBANITE_SHOP_ID ? getConfiguredSiteUrl().replace(/\/$/, '') : shopUrl(shop.slug, '').replace(/\/$/, '');
  const link = event === 'credit_expiring' ? `${site}/` : `${site}/account?tab=coupons`;
  const style = STYLE[event];
  const { data: customer } = await scopedClient(shopId).from('customers').select('email, line_user_id').eq('user_id', userId).maybeSingle();
  const tasks: Promise<unknown>[] = [];

  if (want('email')) {
    const cfg = await getIntegrations(['RESEND_API_KEY', 'EMAIL_FROM'] as const);
    let email = customer?.email || '';
    if (!email) email = (await createAdminClient().auth.admin.getUserById(userId)).data.user?.email ?? '';
    if (cfg.RESEND_API_KEY && cfg.EMAIL_FROM && email && !email.endsWith('@line.urbanite.com.tw')) {
      const rows = (notice.rows ?? []).filter(([, v]) => v).map(([k, v]) => `<p style="margin:4px 0"><b>${esc(k)}:</b>${esc(v)}</p>`).join('');
      const html = `<div style="background:#f6f2ec;padding:24px 12px;font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;color:#1f1b19"><div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px 24px">
        <p style="margin:0 0 16px;font-size:18px;font-weight:700;letter-spacing:.08em">${esc(shop.name)}</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:${style.color}">${esc(notice.title)}</p>
        <p style="margin:8px 0;font-size:28px;font-weight:700">${esc(notice.highlight)}</p>
        <p style="margin:0 0 12px;color:#6b6156;font-size:14px">${esc(notice.subtitle)}</p>${rows}
        <p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#1f1b19;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px">${esc(style.button)}</a></p></div></div>`;
      tasks.push(fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${String(shop.name).replace(/[<>"\r\n]/g, '')} <${cfg.EMAIL_FROM}>`, to: [email], subject: `【${shop.name}】${notice.title}`, html }),
      }).then(async (r) => { if (!r.ok) console.error('member notice email failed', event, r.status); }));
    }
  }

  if (want('line') && customer?.line_user_id) {
    const token = (shopId === URBANITE_SHOP_ID ? await getMessagingConfig() : await getShopLineConfig(shopId))?.accessToken;
    if (token) {
      const contents = noticeBubble({ shopName: shop.name, title: notice.title, subtitle: notice.subtitle, highlight: notice.highlight, rows: notice.rows ?? [], link, buttonLabel: style.button, icon: style.icon, color: style.color });
      tasks.push(fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: customer.line_user_id, messages: [{ type: 'flex', altText: `【${shop.name}】${notice.title}`.slice(0, 300), contents }] }),
      }).then(async (r) => { if (!r.ok) console.error('member notice LINE failed', event, r.status); }));
    }
  }
  await Promise.allSettled(tasks);
}
