import { NextResponse } from 'next/server';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { getCurrentShop } from '@/lib/shop';
import { createAdminClient } from '@/lib/supabase/admin';
import { manualOrderActions } from '@/lib/manual-order';
import type { Order, Shipment } from '@/lib/types';
import { kickOrderNotifications } from '@/lib/order-notification-kick';

type Context = { params: Promise<{ id: string }> };
async function access(context: Context) {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: '請先登入' }, { status: 401 }) };
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended') return { response: NextResponse.json({ error: '找不到商店' }, { status: 404 }) };
  const { id } = await context.params;
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return { response: NextResponse.json({ error: '找不到訂單' }, { status: 404 }) };
  const db = createAdminClient();
  const { data: order, error } = await db.from('orders').select('*').eq('shop_id', shop.id).eq('id', id).maybeSingle();
  if (error) return { response: NextResponse.json({ error: '無法讀取訂單' }, { status: 503 }) };
  const seller = !!(await getAdminUser());
  if (!order || (!seller && order.user_id !== user.id)) return { response: NextResponse.json({ error: '找不到訂單' }, { status: 404 }) };
  return { user, shop, order: order as Order, seller, db };
}
export async function GET(_request: Request, context: Context) {
  const ctx = await access(context);
  if (ctx.response) return ctx.response;
  const { db, order, shop, seller, user } = ctx;
  const { data: version } = await db.rpc('order_workflow_version');
  if (version !== 1) return NextResponse.json({ ready: false, arrived: false, complete: false });
  const { data: shipments, error } = await db.from('shipments').select('*').eq('shop_id', shop.id).eq('order_id', order.id).order('created_at', { ascending: false }).order('id', { ascending: false });
  const { data: returns, error: returnError } = await db.from('returns').select('id').eq('shop_id', shop.id).eq('order_id', order.id).neq('status', 'REJECTED').limit(1);
  if (error || returnError) return NextResponse.json({ error: '無法讀取貨態' }, { status: 503 });
  const actions = manualOrderActions(order, (shipments ?? []) as Shipment[], !!returns?.length);
  return NextResponse.json({ ready: true, arrived: seller && actions.arrived, complete: order.user_id === user.id && actions.complete }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: Request, context: Context) {
  kickOrderNotifications();
  const ctx = await access(context);
  if (ctx.response) return ctx.response;
  const { db, order, shop, user, seller } = ctx;
  let action: unknown;
  try { action = (await request.json()).action; } catch { return NextResponse.json({ error: '無效的請求' }, { status: 400 }); }
  if (action !== 'arrived' && action !== 'complete') return NextResponse.json({ error: '無效的操作' }, { status: 400 });
  if ((action === 'arrived' && !seller) || (action === 'complete' && order.user_id !== user.id)) return NextResponse.json({ error: '沒有此操作權限' }, { status: 403 });
  const { data: version } = await db.rpc('order_workflow_version');
  if (version !== 1) return NextResponse.json({ error: '手動貨態功能尚未完成資料庫安裝' }, { status: 503 });
  const { data, error } = await db.rpc('manual_order_transition', { p_shop: shop.id, p_order: order.id, p_actor: user.id, p_seller: seller, p_action: action });
  if (error) return NextResponse.json({ error: '目前訂單不可執行此操作，請重新整理貨態。取消、退貨或串接物流訂單不適用。' }, { status: 409 });
  // Only return the same public order fields already available to the buyer, not internal notes.
  const updated = data as Order;
  return NextResponse.json({ order: { id: updated.id, status: updated.status, order_status: updated.order_status, fulfillment_status: updated.fulfillment_status, paid: updated.paid, payment_status: updated.payment_status } });
}
