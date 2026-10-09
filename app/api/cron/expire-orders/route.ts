import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { expireOverdueOrders } from '@/lib/order-expiry';

export const dynamic = 'force-dynamic';

// GET /api/cron/expire-orders — 逾期未付款訂單自動取消(回補庫存)
// 由 Vercel Cron 每日呼叫;必須設定 CRON_SECRET 並帶 Bearer 授權。
// 規則見 lib/payment.ts isPaymentOverdue:未付款、需先付款、尚未出貨,且已超過付款期限。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'scheduler unavailable' }, { status: 503 });
  {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  try {
    const result = await expireOverdueOrders(createAdminClient());
    return NextResponse.json({ ok: true, checked: result.checked, cancelled: result.cancelled.length, orders: result.cancelled });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'failed' }, { status: 500 });
  }
}
