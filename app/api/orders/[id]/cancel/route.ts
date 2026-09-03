import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { canRequestCancel, deriveStatuses } from '@/lib/order-status';
import { restoreOrderStock } from '@/lib/inventory';
import type { Order } from '@/lib/types';

// POST /api/orders/[id]/cancel — 客人提出取消申請(需登入且為本人訂單)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body?.reason ?? '').trim();

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, status, paid, fulfillment_status, cancel_status')
    .eq('id', id)
    .maybeSingle();
  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }
  if (!canRequestCancel(order as Order)) {
    return NextResponse.json({ error: '此訂單目前無法申請取消' }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({ cancel_status: 'REQUESTED', cancel_reason: reason, cancel_requested_at: nowIso })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('order_status_history').insert({
    order_id: id, type: 'order', from_status: '', to_status: 'CANCEL_REQUESTED',
    note: reason ? `客人申請取消:${reason}` : '客人申請取消', created_by: '客人',
  });

  return NextResponse.json(data as Order);
}

// PATCH /api/orders/[id]/cancel — 賣家審核取消申請(限管理員)
// body: { action: 'approve' | 'reject', response?: string }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? '').trim();
  const response = String(body?.response ?? '').trim();
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: '請指定 approve 或 reject' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, paid, total, cancel_status')
    .eq('id', id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  if (order.cancel_status !== 'REQUESTED') {
    return NextResponse.json({ error: '此訂單沒有待審核的取消申請' }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const actor = admin.email || '後台管理員';

  if (action === 'reject') {
    const { data, error } = await supabase
      .from('orders')
      .update({ cancel_status: 'REJECTED', cancel_response: response, cancel_reviewed_at: nowIso })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase.from('order_status_history').insert({
      order_id: id, type: 'order', from_status: 'CANCEL_REQUESTED', to_status: 'REJECTED',
      note: response ? `婉拒取消:${response}` : '婉拒取消申請', created_by: actor,
    });
    return NextResponse.json(data as Order);
  }

  // approve → 取消訂單 + 回補庫存 + 記錄退款(實際退刷仍需人工)
  const derived = deriveStatuses('取消', order.paid);
  const { data, error } = await supabase
    .from('orders')
    .update({
      status: '取消',
      cancel_status: 'APPROVED',
      cancel_response: response,
      cancel_reviewed_at: nowIso,
      ...derived,
      ...(order.paid ? { refund_amount: order.total, net_amount: 0, payment_status: 'REFUNDED' } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  try { await restoreOrderStock(supabase, id, actor); } catch { /* 回補失敗不影響審核 */ }

  const rows: Record<string, unknown>[] = [
    { order_id: id, type: 'order', from_status: 'CANCEL_REQUESTED', to_status: 'CANCELLED', note: response ? `核准取消:${response}` : '核准取消申請', created_by: actor },
  ];
  if (order.paid) {
    rows.push({ order_id: id, type: 'payment', from_status: 'PAID', to_status: 'REFUNDED', note: '訂單取消,需退款(請至金流後台退刷)', created_by: actor });
  }
  try { await supabase.from('order_status_history').insert(rows); } catch { /* 歷程失敗不影響審核 */ }

  return NextResponse.json(data as Order);
}
