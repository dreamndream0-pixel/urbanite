import { getSessionUser } from '@/lib/supabase/server';
import { photoFor } from '@/lib/booking/customers';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// GET /api/booking/photo?id= — 服務照片(只有店家與照片中的顧客本人能看)
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('找不到照片', { status: 404, headers });
  const file = await photoFor(user.id, new URL(request.url).searchParams.get('id') ?? '');
  if (!file) return new Response('找不到照片', { status: 404, headers });
  return new Response(file.data, { headers: { ...headers, 'Content-Type': MIME[file.ext] ?? 'application/octet-stream' } });
}
