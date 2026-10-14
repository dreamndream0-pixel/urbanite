import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import type { Category } from '@/lib/types';
import { shopAdminClient } from '@/lib/shop';

// GET /api/categories — 主站分類(前台與後台共用);?campaign=ID 時另外加上該促銷活動頁的專屬分類
export async function GET(request: Request) {
  const supabase = (await shopAdminClient());
  const campaign = new URL(request.url).searchParams.get('campaign') ?? '';
  let query = supabase.from('categories').select('*').order('sort_order', { ascending: true });
  query = /^[0-9a-f-]{36}$/i.test(campaign) ? query.or(`campaign_id.is.null,campaign_id.eq.${campaign}`) : query.is('campaign_id', null);
  const { data, error } = await query;

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

  const supabase = (await shopAdminClient());
  const { data, error } = await supabase
    .from('categories')
    .insert({
      slug,
      name,
      en: body.en ?? '',
      sort_order: body.sort_order ?? 0,
      parent_id: body.parent_id || null,
      campaign_id: body.campaign_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Category, { status: 201 });
}
