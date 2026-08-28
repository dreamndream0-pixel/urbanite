import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Category } from '@/lib/types';

// GET /api/categories — 取得所有分類(前台與後台共用)
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Category[], {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  });
}

// POST /api/categories — 新增分類(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  const slug = String(body?.slug ?? '').trim().toLowerCase();
  const name = String(body?.name ?? '').trim();
  if (!slug || !name) {
    return NextResponse.json({ error: '請填寫代碼(slug)與名稱' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('categories')
    .insert({
      slug,
      name,
      en: body.en ?? '',
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Category, { status: 201 });
}
