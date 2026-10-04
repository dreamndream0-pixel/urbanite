import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBotConfig, processOrderNotifications, sendBroadcast } from '@/lib/line-bot';

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

  // 到時間的排程推播
  const { data: due } = await supabase.from('line_broadcasts').select('id').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString()).limit(5);
  for (const b of due ?? []) {
    try {
      await sendBroadcast(b.id);
      result.broadcasts++;
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : 'broadcast failed');
    }
  }

  // 訂單通知
  try {
    result.notifications = (await processOrderNotifications()).sent;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'notify failed');
  }
  return NextResponse.json(result);
}
