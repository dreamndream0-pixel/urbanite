import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import type { Banner } from '@/lib/types';
import { shopAdminClient } from '@/lib/shop';

// GET /api/banners — 取得輪播圖(前台與後台共用)
export async function GET() {
  const supabase = (await shopAdminClient());
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Banner[], {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  });
}

// 輪播圖組編號 1~9
function bannerGroup(value: unknown) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(9, Math.max(1, n)) : 1;
}

// POST /api/banners — 新增輪播圖(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  const image = String(body?.image ?? '').trim();
  if (!image) return NextResponse.json({ error: '請提供圖片' }, { status: 400 });

  const supabase = (await shopAdminClient());
  const { data, error } = await supabase
    .from('banners')
    .insert({
      image,
      link: body.link ?? '',
      title: body.title ?? '',
      active: body.active ?? true,
      sort_order: body.sort_order ?? 0,
      ...(bannerGroup(body.group_no) > 1 ? { group_no: bannerGroup(body.group_no) } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Banner, { status: 201 });
}
