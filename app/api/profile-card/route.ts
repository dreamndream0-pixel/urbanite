import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { BIO_LIMIT, MAX_TAGS, SLUG_PATTERN, type ProfileCard, type ProfileCardBlock, type SocialLink } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

// 目前只有一張名片(資料結構已預留多張):取最早建立的一張,沒有就建立預設值
async function loadCard() {
  const supabase = createAdminClient();
  const { data: existing, error: readError } = await supabase
    .from('profile_cards')
    .select('*')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) return existing as ProfileCard;
  const { data: settings } = await supabase.from('site_settings').select('logo_url').eq('id', 1).maybeSingle();
  const { data, error } = await supabase
    .from('profile_cards')
    .insert({
      slug: 'urbanite',
      display_name: 'URBANITE',
      avatar_url: settings?.logo_url ?? '',
      bio: '簡約、質感、日常。打造屬於你的穿搭風格。',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ProfileCard;
}

function tableHint(message: string) {
  return /profile_card/.test(message) ? '(資料表尚未建立,請先執行 migration-profile-card.sql)' : '';
}

// GET /api/profile-card — 名片資料與全部區塊(限管理員)
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  try {
    const card = await loadCard();
    const { data: blocks } = await createAdminClient()
      .from('profile_card_blocks')
      .select('*')
      .eq('card_id', card.id)
      .order('sort_order');
    return NextResponse.json({ card, blocks: (blocks ?? []) as ProfileCardBlock[] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取失敗';
    return NextResponse.json({ error: message + tableHint(message) }, { status: 500 });
  }
}

// PATCH /api/profile-card — 更新個人簡介(限管理員)
export async function PATCH(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  let card: ProfileCard;
  try {
    card = await loadCard();
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取失敗';
    return NextResponse.json({ error: message + tableHint(message) }, { status: 500 });
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.slug === 'string') {
    const slug = body.slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ error: '網址代稱只能用小寫英文、數字、點、底線、連字號(2–30 字)' }, { status: 400 });
    }
    update.slug = slug;
  }
  for (const key of ['display_name', 'avatar_url', 'email'] as const) {
    if (typeof body[key] === 'string') update[key] = body[key].trim();
  }
  if (typeof body.bio === 'string') update.bio = body.bio.trim().slice(0, BIO_LIMIT);
  for (const key of ['show_email', 'show_bio', 'show_socials', 'show_tags', 'published'] as const) {
    if (typeof body[key] === 'boolean') update[key] = body[key];
  }
  if (Array.isArray(body.socials)) {
    update.socials = (body.socials as SocialLink[])
      .filter((s) => s && typeof s.type === 'string')
      .map((s) => ({ type: s.type, value: String(s.value ?? '').trim() }));
  }
  if (Array.isArray(body.tags)) {
    update.tags = (body.tags as unknown[]).map((t) => String(t).trim()).filter(Boolean).slice(0, MAX_TAGS);
  }

  const { data, error } = await createAdminClient().from('profile_cards').update(update).eq('id', card.id).select().single();
  if (error) {
    const taken = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: taken ? '這個網址代稱已被使用' : error.message }, { status: 400 });
  }
  return NextResponse.json(data as ProfileCard);
}
