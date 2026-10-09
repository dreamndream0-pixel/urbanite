import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { limitedFormData } from '@/lib/limited-form';
import { sanitizeImage } from '@/lib/safe-image';

const MAX_SIZE = 3 * 1024 * 1024; // 3MB
const FORMATS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

// POST /api/settings/logo — 上傳 Logo 圖片(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  let formData: FormData;
  try { formData = await limitedFormData(request); }
  catch { return NextResponse.json({ error: '上傳資料無效或過大' }, { status: 400 }); }
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 });
  }
  if (!FORMATS[file.type]) {
    return NextResponse.json({ error: '只接受 PNG / JPG / WEBP / GIF，SVG 請先轉成 PNG' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '檔案請小於 3MB' }, { status: 400 });
  }

  const supabase = (await shopAdminClient());
  const ext = FORMATS[file.type];
  const path = `logo/logo-${Date.now()}.${ext}`;
  let bytes: Buffer;
  try { bytes = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), file.type); }
  catch { return NextResponse.json({ error: '圖片格式無效、尺寸過大或內容損壞' }, { status: 400 }); }

  const { error: upErr } = await supabase.storage
    .from('assets')
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: pub } = supabase.storage.from('assets').getPublicUrl(path);
  const logo_url = pub.publicUrl;

  const { error: dbErr } = await supabase
    .from('site_settings')
    .upsert({ logo_url, updated_at: new Date().toISOString() }, { onConflict: 'shop_id' });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 });

  return NextResponse.json({ logo_url });
}
