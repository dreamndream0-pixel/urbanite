import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { limitedFormData } from '@/lib/limited-form';
import { sanitizeImage } from '@/lib/safe-image';

const MAX_SIZE = 3 * 1024 * 1024; // 3MB
const FORMATS = new Set(['image/png', 'image/jpeg', 'image/webp']);

// POST /api/settings/favicon — 上傳網頁頁籤圖示(限管理員)
// 自動轉成 512×512 透明背景 PNG(等比縮放置中,不裁切),瀏覽器頁籤與加到主畫面的圖示共用
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  let formData: FormData;
  try { formData = await limitedFormData(request); }
  catch { return NextResponse.json({ error: '上傳資料無效或過大' }, { status: 400 }); }
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 });
  if (!FORMATS.has(file.type)) return NextResponse.json({ error: '只接受 PNG / JPG / WEBP,SVG 請先轉成 PNG' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '檔案請小於 3MB' }, { status: 400 });

  let png: Buffer;
  try {
    const clean = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), file.type);
    png = await sharp(clean)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return NextResponse.json({ error: '圖片格式無效、尺寸過大或內容損壞' }, { status: 400 });
  }

  const supabase = await shopAdminClient();
  const path = `favicon/favicon-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage.from('assets').upload(path, png, { contentType: 'image/png', upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  const favicon_url = supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;

  const { error: dbErr } = await supabase
    .from('site_settings')
    .upsert({ favicon_url, updated_at: new Date().toISOString() }, { onConflict: 'shop_id' });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 });
  return NextResponse.json({ favicon_url });
}
