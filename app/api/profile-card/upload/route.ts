import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { sanitizeImage } from '@/lib/safe-image';
import { limitedFormData } from '@/lib/limited-form';
import { accountRateLimit, rateLimitResponse } from '@/lib/account-rate-limit';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 5 * 1024 * 1024; // 前端已先縮圖,這裡是上限保護
const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// POST /api/profile-card/upload — 名片圖片上傳(登入會員皆可,存在自己的資料夾)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  if (!accountRateLimit(user.id, 'image-upload', 20)) return rateLimitResponse();
  let form: FormData;
  try { form = await limitedFormData(request); }
  catch { return NextResponse.json({ error: '上傳資料無效或過大' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 });
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ error: '只接受 PNG / JPG / WEBP' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '檔案請小於 5MB' }, { status: 400 });

  let bytes: Buffer;
  try { bytes = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), file.type); }
  catch { return NextResponse.json({ error: '圖片格式無效、尺寸過大或內容損壞' }, { status: 400 }); }
  const supabase = createAdminClient();
  const path = `profile-card/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('assets').upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ image_url: supabase.storage.from('assets').getPublicUrl(path).data.publicUrl });
}
