import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { detectPlatform, fetchSocialProfile } from '@/lib/social-fetch';
import { normalizeUrl } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

// POST /api/profile-card/social-fetch { url } — 抓社群個人頁的名稱、頭像、追蹤數、簡介
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const url = normalizeUrl(String(body.url ?? ''));
  if (!detectPlatform(url)) return NextResponse.json({ error: '目前支援 YouTube、Instagram、TikTok、Threads、Facebook、X、Pinterest 的個人頁網址' }, { status: 400 });

  let profile;
  try {
    profile = await fetchSocialProfile(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '讀取失敗' }, { status: 502 });
  }
  if (!profile || (!profile.name && !profile.image)) return NextResponse.json({ error: '抓不到這個頁面的資訊,請確認是公開帳號的個人頁網址' }, { status: 404 });

  // 頭像:社群平台的圖片網址會過期,下載後存到自己的空間
  let avatar = '';
  if (profile.image) {
    try {
      const img = await fetch(profile.image, { signal: AbortSignal.timeout(10000) });
      if (img.ok) {
        const buf = await sharp(Buffer.from(await img.arrayBuffer())).resize(400, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
        const supabase = createAdminClient();
        const path = `profile-card/${user.id}/social-${Date.now()}.webp`;
        const { error } = await supabase.storage.from('assets').upload(path, buf, { contentType: 'image/webp', upsert: false });
        if (!error) avatar = supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
      }
    } catch {
      avatar = '';
    }
  }
  return NextResponse.json({ platform: profile.platform, name: profile.name, avatar, statA: profile.statA, statB: profile.statB, bio: profile.bio });
}
