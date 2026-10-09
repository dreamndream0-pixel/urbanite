import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import type { Campaign } from '@/lib/types';
import { shopAdminClient } from '@/lib/shop';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { data, error } = await (await shopAdminClient())
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Campaign[]);
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json();
  const name = String(body?.name ?? '').trim();
  const slug = String(body?.slug ?? '').trim().toLowerCase();
  if (!name || !slugPattern.test(slug)) {
    return NextResponse.json({ error: '請填寫活動名稱，網址只能使用小寫英文、數字與連字號' }, { status: 400 });
  }
  const { data, error } = await (await shopAdminClient()).from('campaigns').insert({
    name,
    slug,
    eyebrow: String(body?.eyebrow ?? 'LIMITED EDITION'),
    title: String(body?.title ?? name),
    description: String(body?.description ?? ''),
    hero_image: String(body?.hero_image ?? ''),
    status: body?.status === 'published' ? 'published' : 'draft',
    start_at: body?.start_at || null,
    end_at: body?.end_at || null,
    theme_color: String(body?.theme_color ?? '#702838'),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Campaign, { status: 201 });
}
