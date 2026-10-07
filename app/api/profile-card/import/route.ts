import { NextResponse } from 'next/server';
import { requireCardOwner } from '@/lib/card-access';
import { readImportPage } from '@/lib/card-import';
import { normalizeUrl } from '@/lib/profile-card';
import { applyImport, templateAllowed, type ImportChoice } from '@/lib/card-import-apply';
import { matchTemplate } from '@/lib/card-template-match';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 圖片多的頁面(例如 LINKGOODS 七十幾張大圖)需要較久

// POST /api/profile-card/import
// { url } → 預覽讀到的內容
// { url, apply: { name, bio, avatar, socials, items: number[] } } → 匯入勾選的項目
export async function POST(request: Request) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const url = normalizeUrl(String(body.url ?? ''));

  let profile;
  try {
    profile = await readImportPage(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '讀取失敗' }, { status: 400 });
  }
  if (!body.apply) {
    if (!profile.items.length && !profile.avatar && !profile.name) return NextResponse.json({ error: '這個頁面讀不到內容,請確認是公開的個人頁網址' }, { status: 404 });
    return NextResponse.json({ ...profile, maxBlocks: owner.plan.limits.maxBlocks, template: matchTemplate(profile.style, templateAllowed(owner.plan)) });
  }

  try {
    const result = await applyImport(owner.user, owner.card, owner.plan, profile, body.apply as ImportChoice);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '匯入失敗' }, { status: 400 });
  }
}
