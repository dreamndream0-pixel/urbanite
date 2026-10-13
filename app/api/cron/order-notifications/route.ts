import { NextResponse } from 'next/server';
import { loadBotConfig } from '@/lib/line-bot';
import { processOrderNotificationQueue } from '@/lib/order-notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  let authorized = !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
  if (!authorized) {
    const { raw } = await loadBotConfig();
    const key = new URL(request.url).searchParams.get('key');
    authorized = typeof raw.cronKey === 'string' && !!raw.cronKey && key === raw.cronKey;
  }
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try { return NextResponse.json(await processOrderNotificationQueue()); }
  catch { return NextResponse.json({ error: '訂單通知佇列處理失敗' }, { status: 503 }); }
}
