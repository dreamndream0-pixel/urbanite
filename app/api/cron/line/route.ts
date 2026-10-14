import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBotConfig, processOrderNotifications, sendBroadcast } from '@/lib/line-bot';
import { processOrderNotificationQueue } from '@/lib/order-notifications';
import { lineBotSchemaReady, runAsShop } from '@/lib/line-channel';
import { URBANITE_SHOP_ID } from '@/lib/shop';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/line?key= — 每 5 分鐘(Supabase pg_cron 呼叫):排程推播、訂單通知
export async function GET(request: Request) {
  const { raw } = await loadBotConfig();
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const auth = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const ok = (typeof raw.cronKey === 'string' && raw.cronKey && key === raw.cronKey) || (cronSecret && auth === `Bearer ${cronSecret}`);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const result = { broadcasts: 0, notifications: 0, errors: [] as string[] };

  // 到時間的排程推播(所有店家;各自用自己的 LINE 金鑰送出)
  const ready = await lineBotSchemaReady();
  const { data: due } = await supabase.from('line_broadcasts').select(ready ? 'id, shop_id' : 'id').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString()).limit(10);
  const rows = (due ?? []) as unknown as { id: string; shop_id?: string }[];
  const shopIds = [...new Set(rows.map((b) => b.shop_id).filter((id): id is string => Boolean(id) && id !== URBANITE_SHOP_ID))];
  const { data: shops } = shopIds.length ? await supabase.from('shops').select('id, slug, name, status').in('id', shopIds) : { data: [] };
  for (const b of rows) {
    const shop = b.shop_id && b.shop_id !== URBANITE_SHOP_ID ? (shops ?? []).find((s) => s.id === b.shop_id) : null;
    if (b.shop_id && b.shop_id !== URBANITE_SHOP_ID && (!shop || shop.status === 'suspended')) continue;
    try {
      await runAsShop(shop, () => sendBroadcast(b.id));
      result.broadcasts++;
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : 'broadcast failed');
    }
  }

  // 訂單通知
  try {
    result.notifications = (await processOrderNotifications()).sent;
    // 新版訂單通知佇列(店家可設定的通知),沒即時送出的在這裡補送
    result.notifications += (await processOrderNotificationQueue()).sent;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'notify failed');
  }
  return NextResponse.json(result);
}
