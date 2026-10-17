import { after, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, processBookingJobs } from '@/lib/booking/server';
import { addPhoto, deletePhoto, deleteRecord, ownedRecord, PHOTO_BUCKET, photoPath, requestConsent, updateRecord } from '@/lib/booking/customers';
import { limitedFormData } from '@/lib/limited-form';
import { sanitizeImage } from '@/lib/safe-image';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// PATCH /api/mycard/booking/records/[id] { service_name, content, performed_on } — 修改服務紀錄
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await updateRecord(user.id, id, { serviceName: String(body?.service_name ?? ''), content: String(body?.content ?? ''), performedOn: String(body?.performed_on ?? '') }));
  } catch (e) { return fail(e); }
}

// POST /api/mycard/booking/records/[id]
// multipart(photo = 圖片, kind = before|after|other)— 新增照片;JSON { action: 'request_consent' } — 請顧客同意公開
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  try {
    if ((request.headers.get('content-type') ?? '').includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      if (body?.action !== 'request_consent') throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
      const r = await requestConsent(user.id, id);
      after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
      return NextResponse.json(r);
    }
    const { business, record } = await ownedRecord(user.id, id);
    let form: FormData;
    try { form = await limitedFormData(request, 4 * 1024 * 1024); }
    catch { throw new BookingError('VALIDATION_ERROR', '照片太大,請換小一點的圖片。', 413); }
    const file = form.get('photo');
    if (!(file instanceof File) || !EXT[file.type]) throw new BookingError('VALIDATION_ERROR', '照片只接受 JPG、PNG、WEBP。', 422);
    let bytes: Buffer;
    try { bytes = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), file.type); }
    catch { throw new BookingError('VALIDATION_ERROR', '照片格式無效或太大。', 422); }
    const path = photoPath(business.id, record.customer_id, randomUUID(), EXT[file.type]);
    const db = createAdminClient();
    const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw new BookingError('SERVER_ERROR', '照片上傳失敗,請稍後再試。', 503);
    try { return NextResponse.json(await addPhoto(user.id, id, path, String(form.get('kind') ?? 'after')), { status: 201 }); }
    catch (e) { await db.storage.from(PHOTO_BUCKET).remove([path]); throw e; }
  } catch (e) { return fail(e); }
}

// DELETE /api/mycard/booking/records/[id](?photo=照片 id 只刪一張)— 刪除紀錄或照片(無法復原)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  const photo = new URL(request.url).searchParams.get('photo');
  try {
    if (photo) await deletePhoto(user.id, photo);
    else await deleteRecord(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
