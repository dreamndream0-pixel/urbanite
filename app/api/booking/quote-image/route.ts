import { getSessionUser } from '@/lib/supabase/server';
import { quoteImageFor } from '@/lib/booking/quotes';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// GET /api/booking/quote-image?q=詢價單&i=第幾張 — 詢價參考圖(只有顧客本人與店家能看)
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('找不到圖片', { status: 404, headers });
  const url = new URL(request.url);
  const file = await quoteImageFor(user.id, url.searchParams.get('q') ?? '', Number(url.searchParams.get('i')) || 0);
  if (!file) return new Response('找不到圖片', { status: 404, headers });
  return new Response(file.data, { headers: { ...headers, 'Content-Type': MIME[file.ext] ?? 'application/octet-stream' } });
}
