import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { requireCurrentShop, shopAdminClient } from '@/lib/shop';
import { accountRateLimit, rateLimitResponse } from '@/lib/account-rate-limit';
import { discoverProducts, readImportedProduct } from '@/lib/product-import-read';
import { applyImportedProduct } from '@/lib/product-import-apply';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('缺少匯入資料');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 250_000) throw new Error('匯入資料過大');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('匯入資料格式錯誤');
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  try {
    const body = await readBody(request);
    if (!['discover', 'read', 'apply'].includes(String(body.action))) return NextResponse.json({ error: '未知的匯入操作' }, { status: 400 });
    if (!accountRateLimit(admin.id, `product-import-${body.action}`, body.action === 'apply' ? 60 : 150)) return rateLimitResponse();
    const shop = await requireCurrentShop();
    const headers = { 'Cache-Control': 'private, no-store' };
    if (body.action === 'discover') return NextResponse.json(await discoverProducts(String(body.root ?? ''), String(body.url ?? ''), Number(body.offset ?? 0), body.seed === true), { headers });
    if (body.action === 'read') return NextResponse.json(await readImportedProduct(String(body.url ?? '')), { headers });
    if (body.rights !== true) return NextResponse.json({ error: '請確認你有權使用來源商品圖片與內容' }, { status: 400 });
    const result = await applyImportedProduct(await shopAdminClient(), shop, body.product, { stock: body.stock, reviewed: body.reviewed, publish: body.publish, category: body.category }, admin.email ?? '商品搬家');
    return NextResponse.json(result, { status: result.status === 'created' ? 201 : 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : '商品搬家失敗';
    const safe = /unsafe public|unsafe.*url|invalid url|lookup|fetch failed/i.test(message) ? '來源網址或圖片無法安全讀取，請確認是公開網址'
      : /abort|timed? ?out/i.test(message) ? '來源讀取逾時，請稍後重試'
      : /input buffer|pixel limit|unsupported image/i.test(message) ? '來源圖片格式無法辨識或尺寸過大' : message;
    return NextResponse.json({ error: safe }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
