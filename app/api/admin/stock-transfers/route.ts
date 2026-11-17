import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { featureDenied } from '@/lib/pos-auth';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { adjustLevel, ensureLocations, loadLevels, locationStockReader, type TransferLine } from '@/lib/stock-locations';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/admin/stock-transfers — 調貨紀錄(最新 100 筆)
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const denied = await featureDenied('multi_location');
  if (denied) return denied;
  const db = await shopAdminClient();
  const { data, error } = await db.from('stock_transfers').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST /api/admin/stock-transfers { from, to, lines:[{ product_id, variant_key, quantity }], note? }
// 調貨:從一個據點搬到另一個據點,總庫存不變。調出據點的數量不夠會擋下。
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const denied = await featureDenied('multi_location');
  if (denied) return denied;
  const shop = await getCurrentShop();
  if (!shop) return NextResponse.json({ error: '找不到這家店' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const db = await shopAdminClient();
  const locations = await ensureLocations(db);
  const from = locations.find((l) => l.id === body?.from);
  const to = locations.find((l) => l.id === body?.to);
  if (!from || !to) return NextResponse.json({ error: '請選擇調出與調入的據點' }, { status: 400 });
  if (from.id === to.id) return NextResponse.json({ error: '調出與調入不能是同一個據點' }, { status: 400 });

  // 同品項合併
  const wanted = new Map<string, { product_id: string; variant_key: string; quantity: number }>();
  for (const l of (Array.isArray(body?.lines) ? body.lines : []) as { product_id?: unknown; variant_key?: unknown; quantity?: unknown }[]) {
    const quantity = Math.floor(Number(l.quantity));
    const product_id = String(l.product_id ?? '');
    const variant_key = String(l.variant_key ?? '');
    if (!product_id || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
    const k = `${product_id}\u0000${variant_key}`;
    wanted.set(k, { product_id, variant_key, quantity: (wanted.get(k)?.quantity ?? 0) + quantity });
  }
  if (!wanted.size) return NextResponse.json({ error: '請加入要調的商品與數量' }, { status: 400 });
  if (wanted.size > 500) return NextResponse.json({ error: '一張調貨單最多 500 個品項' }, { status: 400 });

  const ids = [...new Set([...wanted.values()].map((l) => l.product_id))];
  const [{ data: productRows, error }, levels] = await Promise.all([db.from('products').select('*').in('id', ids), loadLevels(db, ids)]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const products = (productRows ?? []) as Product[];
  const byId = new Map(products.map((p) => [p.id, p]));
  const available = locationStockReader(products, levels, from);

  const lines: TransferLine[] = [];
  for (const l of wanted.values()) {
    const p = byId.get(l.product_id);
    if (!p) return NextResponse.json({ error: `找不到商品:${l.product_id}` }, { status: 400 });
    const hasVariant = p.variants?.length ? p.variants.some((v) => v.options.join(' / ') === l.variant_key) : l.variant_key === '';
    if (!hasVariant) return NextResponse.json({ error: `「${p.name}」沒有這個規格:${l.variant_key || '(未選)'}` }, { status: 400 });
    const have = available(l.product_id, l.variant_key);
    if (l.quantity > have) return NextResponse.json({ error: `「${p.name}」${l.variant_key} 在「${from.name}」只有 ${Math.max(0, have)} 件` }, { status: 409 });
    lines.push({ ...l, name: p.name });
  }

  try {
    for (const l of lines) {
      await adjustLevel(shop.id, from, l.product_id, l.variant_key, -l.quantity);
      await adjustLevel(shop.id, to, l.product_id, l.variant_key, l.quantity);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '調貨失敗' }, { status: 500 });
  }

  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const prefix = `TR${tw.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const { count } = await db.from('stock_transfers').select('id', { count: 'exact', head: true }).like('doc_no', `${prefix}%`);
  const { data: saved, error: saveError } = await db.from('stock_transfers').insert({
    doc_no: `${prefix}${String((count ?? 0) + 1).padStart(3, '0')}`, from_location: from.id, to_location: to.id, from_name: from.name, to_name: to.name,
    lines, handler: admin.email ?? '', note: String(body?.note ?? '').trim().slice(0, 200),
  }).select().single();
  if (saveError) return NextResponse.json({ error: `庫存已調整,但調貨單沒有存成功:${saveError.message}` }, { status: 500 });
  return NextResponse.json({ transfer: saved, levels: await loadLevels(db) }, { status: 201 });
}
