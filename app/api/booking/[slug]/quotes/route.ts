import { after, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, getPublicBusiness, processBookingJobs } from '@/lib/booking/server';
import { QUOTE_IMAGE_BUCKET, requestQuote } from '@/lib/booking/quotes';
import { accountRateLimit } from '@/lib/account-rate-limit';
import { limitedFormData } from '@/lib/limited-form';
import { sanitizeImage } from '@/lib/safe-image';

export const dynamic = 'force-dynamic';

const fail = (e: BookingError) => NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// POST /api/booking/[slug]/quotes — 顧客送出詢價(multipart:data = JSON,images = 最多 3 張參考圖)
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入再送出詢價。', 401));
  if (!accountRateLimit(user.id, 'booking-quote', 5)) return fail(new BookingError('RATE_LIMITED', '操作太頻繁,請稍後再試。', 429));
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug));
  if (!ctx) return fail(new BookingError('NOT_FOUND', '這張名片目前沒有開放預約。', 404));

  let form: FormData;
  try { form = await limitedFormData(request, 4 * 1024 * 1024); }
  catch { return fail(new BookingError('VALIDATION_ERROR', '資料太大,請減少參考圖或換小一點的圖片。', 413)); }
  let body: Record<string, unknown>;
  try { body = JSON.parse(String(form.get('data') ?? '{}')); }
  catch { return fail(new BookingError('VALIDATION_ERROR', '資料格式錯誤。', 422)); }
  const contact = (body.contact ?? {}) as Record<string, unknown>;
  const name = String(contact.name ?? '').trim();
  const phone = String(contact.phone ?? '').trim();
  if (!name) return fail(new BookingError('VALIDATION_ERROR', '請填寫姓名。', 422));
  if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) return fail(new BookingError('VALIDATION_ERROR', '請填寫正確的聯絡電話。', 422));

  // 參考圖:重新編碼去除中繼資料,放私人空間
  const quoteId = randomUUID();
  const db = createAdminClient();
  const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
  const paths: string[] = [];
  for (const file of files) {
    if (!EXT[file.type]) return fail(new BookingError('VALIDATION_ERROR', '參考圖只接受 JPG、PNG、WEBP。', 422));
    let bytes: Buffer;
    try { bytes = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), file.type); }
    catch { return fail(new BookingError('VALIDATION_ERROR', '參考圖格式無效或太大。', 422)); }
    const path = `${ctx.business.id}/quotes/${quoteId}/${randomUUID()}.${EXT[file.type]}`;
    const { error } = await db.storage.from(QUOTE_IMAGE_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) return fail(new BookingError('SERVER_ERROR', '參考圖上傳失敗,請稍後再試。', 503));
    paths.push(path);
  }

  const req = (body.request ?? {}) as Record<string, unknown>;
  try {
    const quote = await requestQuote({
      slug: decodeURIComponent(slug), userId: user.id, serviceId: String(body.service_id ?? ''), staffId: body.staff_id ? String(body.staff_id) : null, quoteId,
      request: {
        event_date: String(req.event_date ?? ''), time: String(req.time ?? ''), event_type: String(req.event_type ?? ''),
        address: String(req.address ?? ''), people: String(req.people ?? ''), note: String(req.note ?? ''),
      },
      images: paths, contact: { name, phone },
    });
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({ quote_id: quote.id, quote_no: quote.quote_no }, { status: 201 });
  } catch (e) {
    if (paths.length) await db.storage.from(QUOTE_IMAGE_BUCKET).remove(paths);
    return fail(e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '詢價送出失敗,請稍後再試。', 500));
  }
}
