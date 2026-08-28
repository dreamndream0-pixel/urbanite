import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// 副檔名一律由 MIME 類型決定,避免用手機原始檔名(可能含中文/空白)組出無效的儲存路徑
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// POST /api/products/image — 上傳商品圖片到 Supabase Storage(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  const productId = String(formData.get('productId') ?? 'new').replace(/[^a-zA-Z0-9_-]/g, '-');
  const folder = String(formData.get('folder') ?? 'products').replace(/[^a-zA-Z0-9_-]/g, '') || 'products';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: '只接受 PNG / JPG / WEBP / GIF' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '檔案請小於 5MB' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const ext = EXT_BY_TYPE[file.type] ?? 'jpg';
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${folder}/${productId || 'new'}-${Date.now()}-${rand}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from('assets')
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data } = supabase.storage.from('assets').getPublicUrl(path);
  return NextResponse.json({ image_url: data.publicUrl });
}
