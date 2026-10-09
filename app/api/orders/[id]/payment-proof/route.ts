import { NextResponse } from 'next/server';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { randomUUID } from 'node:crypto';
import type { Order } from '@/lib/types';
import { shopAdminClient } from '@/lib/shop';
import { sanitizeImage } from '@/lib/safe-image';
import { limitedFormData } from '@/lib/limited-form';
import { PAYMENT_PROOF_BUCKET, PRIVATE_PROOF_PREFIX, paymentProofPath, legacyPaymentProofPath } from '@/lib/payment-proof';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
  const denied = () => NextResponse.json({ error: '找不到付款證明' }, { status: 404, headers });
  const user = await getSessionUser();
  if (!user) return denied();
  const { id } = await params;
  const supabase = await shopAdminClient();
  const { data: order, error } = await supabase.from('orders').select('id, shop_id, user_id, payment_proof_url').eq('id', id).maybeSingle();
  if (error || !order || (order.user_id !== user.id && !(await getAdminUser()))) return denied();
  const reference = String(order.payment_proof_url ?? '');
  const privatePath = paymentProofPath(reference, order.shop_id, order.id);
  const legacyPath = legacyPaymentProofPath(reference, order.id, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (!privatePath && !legacyPath) return denied();
  const { data, error: downloadError } = await supabase.storage.from(privatePath ? PAYMENT_PROOF_BUCKET : 'assets').download(privatePath ?? legacyPath!);
  if (downloadError || !data) return denied();
  const ext = (privatePath ?? legacyPath!).split('.').pop() ?? '';
  const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
  return new Response(data, { headers: { ...headers, 'Content-Type': mime[ext] ?? 'application/octet-stream', 'Content-Disposition': 'inline; filename="payment-proof.' + ext + '"' } });
}

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
  const supabase = (await shopAdminClient());
  const { data: order } = await supabase
    .from('orders')
    .select('id, shop_id, user_id, paid')
    .eq('id', id)
    .maybeSingle();
  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }

  let form: FormData;
  try { form = await limitedFormData(request); }
  catch { return NextResponse.json({ error: '上傳資料無效或過大' }, { status: 400 }); }
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
    const path = `${order.shop_id}/${id}/${randomUUID()}.${ext}`;
    let bytes: Buffer;
    try { bytes = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), file.type); }
    catch { return NextResponse.json({ error: '圖片格式無效、尺寸過大或內容損壞' }, { status: 400 }); }
    const { error: upErr } = await supabase.storage
      .from(PAYMENT_PROOF_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: '0' });
    if (upErr) return NextResponse.json({ error: '付款證明上傳失敗，請稍後再試' }, { status: 503 });
    update.payment_proof_url = PRIVATE_PROOF_PREFIX + path;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '請輸入帳號後五碼或上傳截圖' }, { status: 400 });
  }

  const { data, error } = await supabase.from('orders').update(update).eq('id', id).eq('user_id', user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('order_status_history').insert({
    order_id: id, type: 'payment', from_status: '', to_status: 'PROOF_SUBMITTED',
    note: `買家回報付款${last5 ? `(後五碼 ${last5})` : ''}${update.payment_proof_url ? '(附截圖)' : ''}`,
    created_by: '客人',
  });

  return NextResponse.json(data as Order);
}
