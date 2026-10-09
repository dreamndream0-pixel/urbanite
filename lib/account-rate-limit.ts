// Per-instance backstop, not a replacement for distributed edge rate limits.
const buckets = new Map<string, { count: number; expires: number }>();
const WINDOW_MS = 60_000;
export function accountRateLimit(userId: string, action: string, limit: number, now = Date.now()): boolean {
  for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key);
  const key = `${action}:${userId}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= 10_000) return false;
    bucket = { count: 0, expires: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

export function rateLimitResponse(): Response {
  return Response.json({ error: '操作太頻繁，請稍後再試' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
}
