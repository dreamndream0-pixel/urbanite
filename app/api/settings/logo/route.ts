import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';

const MAX_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];

// POST /api/settings/logo — 上傳 Logo 圖片(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: '只接受 PNG / JPG / WEBP / SVG / GIF' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '檔案請小於 3MB' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `logo/logo-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from('assets')
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: pub } = supabase.storage.from('assets').getPublicUrl(path);
  const logo_url = pub.publicUrl;

  const { error: dbErr } = await supabase
    .from('site_settings')
    .upsert({ id: 1, logo_url, updated_at: new Date().toISOString() });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 });

  return NextResponse.json({ logo_url });
}
