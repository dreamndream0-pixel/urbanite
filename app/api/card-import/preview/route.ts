import { NextResponse } from 'next/server';
import { readImportPage } from '@/lib/card-import';
import { importRows } from '@/lib/card-import-apply';
import { normalizeUrl, type ProfileCard, type ProfileCardBlock } from '@/lib/profile-card';
import { FREE_LIMITS } from '@/lib/card-plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/card-import/preview { url } — 官網介紹頁的一鍵搬家預覽(不用登入)
// 只讀取、不存檔;圖片用原網址顯示,真正搬家時才下載到自己的空間
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const url = normalizeUrl(String(body.url ?? '').trim());
  if (!url) return NextResponse.json({ error: '請貼上你的個人頁網址' }, { status: 400 });
  let profile;
  try {
    profile = await readImportPage(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '讀取失敗' }, { status: 400 });
  }
  if (!profile.items.length && !profile.avatar && !profile.name) {
    return NextResponse.json({ error: '這個頁面讀不到內容,請確認是公開的個人頁網址' }, { status: 404 });
  }
  const card: ProfileCard = {
    id: 'preview',
    slug: 'preview',
    display_name: profile.name,
    avatar_url: profile.avatar,
    email: '',
    show_email: false,
    bio: profile.bio,
    show_bio: true,
    socials: profile.socials,
    show_socials: true,
    tags: (profile.tags ?? []).slice(0, 3),
    show_tags: Boolean(profile.tags?.length),
    theme: {},
    published: true,
    seo_title: '',
    seo_description: '',
    seo_image: '',
    show_footer_logo: true,
  };
  const blocks = importRows(profile.items, card.id, 0, (_key, original) => original).map(
    (row, i) => ({ ...row, id: `p${i}`, clicks: 0, start_at: null, end_at: null }) as unknown as ProfileCardBlock,
  );
  return NextResponse.json({ source: profile.source, url, card, blocks, freeBlocks: FREE_LIMITS.maxBlocks });
}
