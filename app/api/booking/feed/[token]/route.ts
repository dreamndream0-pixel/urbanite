import { feedFor } from '@/lib/booking/calendar';

export const dynamic = 'force-dynamic';

// GET /api/booking/feed/[token] — 預約行事曆訂閱(私密網址;Google / Apple 行事曆「從網址新增」)
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await feedFor(token.replace(/\.ics$/, ''));
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="bookings.ics"',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
