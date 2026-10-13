import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop } from '@/lib/shop';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrderNotificationConfig, saveOrderNotificationConfig } from '@/lib/order-notification-config';
import { resolveOrderNotificationSettings } from '@/lib/order-notification-settings';

export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const shop = await getCurrentShop();
  if (!shop) return NextResponse.json({ error: '找不到商店' }, { status: 404 });
  const config = await getOrderNotificationConfig(shop.id);
  const db = createAdminClient();
  const { data: version } = await db.rpc('order_workflow_version');
  const { data: recent } = await db.from('order_notification_jobs').select('id,event,audience,channel,status,attempts,last_error,created_at').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(20);
  return NextResponse.json({ settings: config?.settings ?? resolveOrderNotificationSettings(null), configured: !!config, ready: version === 1, recent: recent ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PATCH(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const shop = await getCurrentShop();
  if (!shop) return NextResponse.json({ error: '找不到商店' }, { status: 404 });
  const { data: version } = await createAdminClient().rpc('order_workflow_version');
  if (version !== 1) return NextResponse.json({ error: '請先安裝訂單通知與手動貨態資料庫遷移' }, { status: 503 });
  try {
    const body = await request.json();
    const settings = await saveOrderNotificationConfig(shop.id, body.settings);
    return NextResponse.json({ settings });
  } catch { return NextResponse.json({ error: '儲存失敗，請重試' }, { status: 500 }); }
}
