import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Order } from '@/lib/types';

// PATCH /api/orders/[id] — 更新訂單狀態 / 付款狀態(限管理員)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if (typeof body.status === 'string') update.status = body.status;
  if (typeof body.paid === 'boolean') update.paid = body.paid;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Order);
}
