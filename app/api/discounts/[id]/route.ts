import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { taipeiInputToISO } from '@/lib/taipei-time';
import type { Discount } from '@/lib/types';

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

// PATCH /api/discounts/[id] — 編輯折扣碼(限管理員)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string') update.name = body.name.trim();
  if (typeof body.image === 'string') update.image = body.image || null;
  if (typeof body.code === 'string') update.code = body.code.trim().toUpperCase();
  if (typeof body.value === 'number') update.value = body.value;
  if (typeof body.min_spend === 'number') update.min_spend = body.min_spend;
  if (typeof body.max_discount === 'number') update.max_discount = body.max_discount || null;
  if (typeof body.total_limit === 'number') update.total_limit = body.total_limit || null;
  if (typeof body.per_user_limit === 'number') update.per_user_limit = body.per_user_limit || 1;
  if (typeof body.active === 'boolean') update.active = body.active;
  if (typeof body.start_at === 'string') update.start_at = taipeiInputToISO(body.start_at);
  if (typeof body.end_at === 'string') update.end_at = taipeiInputToISO(body.end_at);
  if (typeof body.status === 'string') {
    update.status = body.status;
    update.active = body.status === '啟用';
  }
  if (typeof body.applicable_users === 'string') update.applicable_users = body.applicable_users;
  if (typeof body.stackable === 'boolean') update.stackable = body.stackable;
  if (typeof body.is_first_purchase_only === 'boolean') update.is_first_purchase_only = body.is_first_purchase_only;
  if ('applicable_products' in body) update.applicable_products = list(body.applicable_products);
  if ('applicable_categories' in body) update.applicable_categories = list(body.applicable_categories);
  if (body.type === 'percent' || body.type === 'amount' || body.type === 'free_shipping') update.type = body.type;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('discounts')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Discount);
}

// DELETE /api/discounts/[id] — 刪除折扣碼(限管理員)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('discounts').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
