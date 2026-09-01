import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Discount } from '@/lib/types';

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
  const insert = {
    name: String(body.name ?? '').trim(),
    code,
    type: body.type === 'amount' ? 'amount' : 'percent',
    value: Number(body.value) || 0,
    min_spend: Number(body.min_spend) || 0,
    max_discount: Number(body.max_discount) || null,
    active: body.active ?? true,
  };
  let { data, error } = await supabase
    .from('discounts')
    .insert(insert)
    .select()
    .single();

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
