import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import type { Order } from '@/lib/types';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

// POST /api/orders/[id]/payment-proof — 買家回報付款(帳號後五碼 / 備註 / 截圖),限本人訂單
// 接受 multipart/form-data:欄位 last5, note, file(選填)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, paid')
    .eq('id', id)
    .maybeSingle();
  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }

  const form = await request.formData();
  const last5 = String(form.get('last5') ?? '').trim().slice(0, 20);
  const note = String(form.get('note') ?? '').trim().slice(0, 500);
  const file = form.get('file');

  const update: Record<string, unknown> = {};
  if (last5) update.payment_ref = last5;
  if (note) update.payment_proof_note = note;

  if (file instanceof File && file.size > 0) {
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: '截圖只接受 PNG / JPG / WEBP / GIF' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '截圖請小於 5MB' }, { status: 400 });
    }
    const ext = EXT_BY_TYPE[file.type] ?? 'jpg';
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `payment-proofs/${id}-${Date.now()}-${rand}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from('assets')
      .upload(path, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
    update.payment_proof_url = supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '請輸入帳號後五碼或上傳截圖' }, { status: 400 });
  }

  const { data, error } = await supabase.from('orders').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('order_status_history').insert({
    order_id: id, type: 'payment', from_status: '', to_status: 'PROOF_SUBMITTED',
    note: `買家回報付款${last5 ? `(後五碼 ${last5})` : ''}${update.payment_proof_url ? '(附截圖)' : ''}`,
    created_by: '客人',
  });

  return NextResponse.json(data as Order);
}
