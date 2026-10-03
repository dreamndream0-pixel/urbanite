import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { expireOverdueOrders } from '@/lib/order-expiry';

export const dynamic = 'force-dynamic';

// GET /api/cron/expire-orders — 逾期未付款訂單自動取消(回補庫存)
// 由 Vercel Cron 每日呼叫;若設有 CRON_SECRET,需帶對應授權。
// 規則見 lib/payment.ts isPaymentOverdue:未付款、需先付款、尚未出貨,且已超過付款期限。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    const key = new URL(request.url).searchParams.get('key') || '';
    if (auth !== `Bearer ${secret}` && key !== secret) {
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
