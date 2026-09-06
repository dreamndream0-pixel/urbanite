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

function discountPayload(body: Record<string, unknown>, code: string) {
  const type = body.type === 'amount' || body.type === 'free_shipping' ? body.type : 'percent';
  return {
    name: String(body.name ?? '').trim(),
    code,
    type,
    value: type === 'free_shipping' ? 0 : Number(body.value) || 0,
    min_spend: Number(body.min_spend) || 0,
    max_discount: Number(body.max_discount) || null,
    start_at: taipeiInputToISO(body.start_at),
    end_at: taipeiInputToISO(body.end_at),
    total_limit: Number(body.total_limit) || null,
    per_user_limit: Number(body.per_user_limit) || 1,
    applicable_products: list(body.applicable_products),
    applicable_categories: list(body.applicable_categories),
    applicable_users: String(body.applicable_users ?? 'all'),
    is_first_purchase_only: Boolean(body.is_first_purchase_only),
    stackable: Boolean(body.stackable),
    status: String(body.status ?? (body.active === false ? '停用' : '啟用')),
    active: body.active ?? String(body.status ?? '啟用') === '啟用',
    image: body.image ? String(body.image) : null,
  };
}

// GET /api/discounts — 折扣碼清單(限管理員)
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Discount[]);
}

// POST /api/discounts — 新增折扣碼(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  const code = String(body?.code ?? '').trim().toUpperCase();
  if (!code) return NextResponse.json({ error: '請填寫折扣碼' }, { status: 400 });

  const supabase = createAdminClient();
  const insert = discountPayload(body, code);
  let { data, error } = await supabase
    .from('discounts')
    .insert(insert)
    .select()
    .single();

  // image 欄位可能尚未建立:先去掉 image 重試(保留其餘欄位),仍失敗才降到最小欄位
  if (error && /image|schema cache/i.test(error.message)) {
    const { image: _drop, ...withoutImage } = insert;
    void _drop;
    const retry = await supabase.from('discounts').insert(withoutImage).select().single();
    data = retry.data;
    error = retry.error;
  }
  if (error && /name|max_discount|schema cache/i.test(error.message)) {
    const retry = await supabase
      .from('discounts')
      .insert({
        code,
        type: insert.type,
        value: insert.value,
        min_spend: insert.min_spend,
        active: insert.active,
      })
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Discount, { status: 201 });
}
