import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCardOwner } from '@/lib/card-access';
import { FREE_TEMPLATE_KEYS, RESERVED_SLUGS } from '@/lib/card-plan';
import { BIO_LIMIT, CARD_TEMPLATES, DEFAULT_THEME, MAX_TAGS, SLUG_PATTERN, type ProfileCard, type ProfileCardBlock, type SocialLink } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

function tableHint(message: string) {
  return /profile_card/.test(message) ? '(資料表尚未建立,請先執行 migration-profile-card.sql)' : '';
}

// GET /api/profile-card — 登入者自己的名片、全部區塊、目前方案(沒有名片會自動建立)
export async function GET() {
  try {
    const owner = await requireCardOwner();
    if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
    const { card, plan } = owner;
    const { data: blocks } = await createAdminClient()
      .from('profile_card_blocks')
      .select('*')
      .eq('card_id', card.id)
      .order('sort_order');
    return NextResponse.json({ card, blocks: (blocks ?? []) as ProfileCardBlock[], plan }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取失敗';
    return NextResponse.json({ error: message + tableHint(message) }, { status: 500 });
  }
}

// PATCH /api/profile-card — 更新自己的名片(依方案限制可用功能)
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  let owner: Awaited<ReturnType<typeof requireCardOwner>>;
  try {
    owner = await requireCardOwner();
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取失敗';
    return NextResponse.json({ error: message + tableHint(message) }, { status: 500 });
  }
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const { card, plan } = owner;
  const { limits } = plan;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.slug === 'string') {
    const slug = body.slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ error: '網址代稱只能用小寫英文、數字、點、底線、連字號(2–30 字)' }, { status: 400 });
    }
    if (RESERVED_SLUGS.includes(slug) || (slug === 'urbanite' && !plan.isAdmin)) {
      return NextResponse.json({ error: '這個網址代稱不能使用,請換一個' }, { status: 400 });
    }
    update.slug = slug;
  }
  for (const key of ['display_name', 'avatar_url', 'email'] as const) {
    if (typeof body[key] === 'string') update[key] = body[key].trim();
  }
  // 自訂分享預覽:Pro
  if (limits.seo) {
    for (const key of ['seo_title', 'seo_description', 'seo_image'] as const) {
      if (typeof body[key] === 'string') update[key] = body[key].trim();
    }
  }
  if (typeof body.bio === 'string') update.bio = body.bio.trim().slice(0, BIO_LIMIT);
  for (const key of ['show_email', 'show_bio', 'show_socials', 'show_tags', 'published', 'show_footer_logo'] as const) {
    if (typeof body[key] === 'boolean') update[key] = body[key];
  }
  // 隱藏頁尾標誌:Pro
  if (!limits.hideFooter) update.show_footer_logo = true;
  if (Array.isArray(body.socials)) {
    update.socials = (body.socials as SocialLink[])
      .filter((s) => s && typeof s.type === 'string')
      .map((s) => ({ type: s.type, value: String(s.value ?? '').trim() }));
  }
  // 外觀:只保留已知欄位
  if (body.theme && typeof body.theme === 'object') {
    const theme: Record<string, unknown> = {};
    for (const key of Object.keys(DEFAULT_THEME) as (keyof typeof DEFAULT_THEME)[]) {
      const value = (body.theme as Record<string, unknown>)[key];
      if (typeof value === typeof DEFAULT_THEME[key]) theme[key] = value;
    }
    // 免費版:只能用免費樣板,樣式固定為樣板原樣(封面、大頭照開關保留)
    if (!limits.customStyle) {
      const key = FREE_TEMPLATE_KEYS.includes(String(theme.template)) ? String(theme.template) : 'ivory';
      const tpl = CARD_TEMPLATES.find((t) => t.key === key);
      update.theme = { ...(tpl?.theme ?? {}), template: key, coverImage: theme.coverImage ?? '', showAvatar: theme.showAvatar ?? true };
    } else {
      if (!limits.allTemplates && !FREE_TEMPLATE_KEYS.includes(String(theme.template))) theme.template = 'ivory';
      update.theme = theme;
    }
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
