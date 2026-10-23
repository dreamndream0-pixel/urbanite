import { NextResponse } from 'next/server';
import { shopAdminClient } from '@/lib/shop';
import { canAccessOrder } from '@/lib/order-access';
import { accountRateLimit } from '@/lib/account-rate-limit';
import { createOrderAccessToken, orderAccessCookieName, ORDER_ACCESS_MAX_AGE } from '@/lib/order-access-token';
import { publicOrder, type PublicShipment } from '@/lib/order-public';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const digits = (v: string) => v.replace(/\D/g, '');

async function load(orderNo: string) {
  const supabase = await shopAdminClient();
  const { data } = await supabase.from('orders').select('*').eq('order_no', orderNo).maybeSingle();
  if (!data) return null;
  const { data: ships } = await supabase.from('shipments').select('*').eq('order_id', data.id).order('created_at', { ascending: true });
  const shipments: PublicShipment[] = (ships ?? []).map((s) => ({ carrier: String(s.carrier || s.provider || ''), tracking_number: String(s.tracking_number ?? ''), status: String(s.status ?? '') }));
  return { row: data, view: publicOrder(data, shipments) };
}

// GET /api/orders/lookup?no= — 已有權限(下單的瀏覽器 / 本人登入)直接看訂單
export async function GET(request: Request) {
  const no = String(new URL(request.url).searchParams.get('no') ?? '').trim().slice(0, 40);
  if (!no) return NextResponse.json({ error: '缺少訂單編號' }, { status: 400, headers });
  const found = await load(no);
  if (!found || !(await canAccessOrder(found.row))) return NextResponse.json({ error: 'need_verify' }, { status: 403, headers });
  return NextResponse.json(found.view, { headers });
}

// POST /api/orders/lookup { order_no, contact } — 訪客查詢:訂單編號 + 下單時的手機或 Email 都對才顯示
// 通過後發 7 天的訂單存取憑證(之後可回報付款、不用再輸入)
export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (!accountRateLimit(ip, 'order-lookup', 10)) return NextResponse.json({ error: '查詢太頻繁，請稍後再試' }, { status: 429, headers });
  const body = await request.json().catch(() => ({})) as { order_no?: unknown; contact?: unknown };
  const no = String(body.order_no ?? '').trim().toUpperCase().slice(0, 40);
  const contact = String(body.contact ?? '').trim().slice(0, 120);
  if (!no || !contact) return NextResponse.json({ error: '請輸入訂單編號與下單時的手機或 Email' }, { status: 400, headers });
  const found = await load(no);
  const row = found?.row as { phone?: string; email?: string; user_id?: string | null; order_no: string } | undefined;
  const phoneOk = row && digits(contact).length >= 8 && digits(contact) === digits(String(row.phone ?? ''));
  const emailOk = row && contact.includes('@') && contact.toLowerCase() === String(row.email ?? '').trim().toLowerCase();
  if (!found || !row || (!phoneOk && !emailOk)) return NextResponse.json({ error: '查不到符合的訂單，請確認訂單編號與手機 / Email 是否正確' }, { status: 404, headers });
  if (row.user_id) return NextResponse.json({ error: '這是會員訂單，請登入會員後到「我的訂單」查看', member: true }, { status: 403, headers });
  const response = NextResponse.json(found.view, { headers });
  response.cookies.set(orderAccessCookieName(row.order_no), createOrderAccessToken(row.order_no), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: ORDER_ACCESS_MAX_AGE,
  });
  return response;
}
