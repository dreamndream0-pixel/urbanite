import { NextResponse } from 'next/server';
import { fetchPublic } from '@/lib/public-fetch';
import { accountRateLimit, rateLimitResponse } from '@/lib/account-rate-limit';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 1024 * 1024;

// 內網 / 本機位址不抓(避免被拿來探測伺服器內部)

function decode(s: string) {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

function meta(html: string, keys: string[]) {
  for (const key of keys) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (name !== key) continue;
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
      if (content?.trim()) return decode(content);
    }
  }
  return '';
}

async function readLimited(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  void reader.cancel().catch(() => {});
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

// GET /api/profile-card/og?url= — 貼上網址後自動帶出標題與圖片
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  if (!accountRateLimit(user.id, 'url-preview', 30)) return rateLimitResponse();
  const raw = new URL(request.url).searchParams.get('url')?.trim() ?? '';
  if (!raw) return NextResponse.json({ error: '請輸入網址' }, { status: 400 });
  try {
    // 站內路徑(/products/…)以目前網域開啟
    const initial = new URL(raw.startsWith('/') ? raw : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`, request.url);
    const { res, url: target } = await fetchPublic(initial.href, MAX_BYTES);
    if (!res || !res.ok) return NextResponse.json({ title: '', image: '' });
    if (!(res.headers.get('content-type') ?? '').includes('html')) return NextResponse.json({ title: '', image: '' });
    const html = await readLimited(res);
    const title = meta(html, ['og:title', 'twitter:title']) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '');
    const imageRaw = meta(html, ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
    let image = '';
    if (imageRaw) {
      try {
        const u = new URL(imageRaw, target);
        if (u.protocol === 'https:' || u.protocol === 'http:') image = u.toString();
      } catch { /* 圖片網址無效就略過 */ }
    }
    return NextResponse.json({ title: title.slice(0, 80), image });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error && e.message.includes('網址') ? e.message : '無法讀取這個網址' }, { status: 400 });
  }
}
