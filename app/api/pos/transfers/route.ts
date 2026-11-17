import { NextResponse } from 'next/server';
import { allowedLocations, can, featureDenied, getPosUser } from '@/lib/pos-auth';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { createTransfer, ensureLocations, loadLevels, locationStockReader } from '@/lib/stock-locations';
import { loadPosProducts } from '@/lib/pos-server';
import { variantKey } from '@/lib/pos';

export const dynamic = 'force-dynamic';

// GET /api/pos/transfers?from=<據點> — POS 調撥:最近的調貨單(最新 30 筆)、可選的據點、調出據點各品項的數量
export async function GET(request: Request) {
  const me = await getPosUser();
  if (!me) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const denied = await featureDenied('multi_location');
  if (denied) return denied;
  if (!can(me, 'transfer')) return NextResponse.json({ error: '這個帳號沒有「調撥」的權限' }, { status: 403 });
  const db = await shopAdminClient();
  const [{ data }, locations, levels, products] = await Promise.all([
    db.from('stock_transfers').select('*').order('created_at', { ascending: false }).limit(30),
    ensureLocations(db),
    loadLevels(db),
    loadPosProducts(db),
  ]);
  // 調出據點的數量:{ '商品id|規格': 數量 }(只列有貨的)
  const from = locations.find((l) => l.id === new URL(request.url).searchParams.get('from') && l.active);
  const stock: Record<string, number> = {};
  if (from) {
    const read = locationStockReader(products, levels, from);
    for (const p of products) {
      for (const key of p.variants?.length ? p.variants.map((v) => variantKey(v.options)) : ['']) {
        const n = read(p.id, key);
        if (n > 0) stock[`${p.id}|${key}`] = n;
      }
    }
  }
  return NextResponse.json({
    transfers: data ?? [],
    locations: locations.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name, kind: l.kind, is_default: l.is_default })),
    stock,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST /api/pos/transfers { from, to, lines:[{ product_id, variant_key, quantity }], note? } — POS 調撥
// 員工被限定據點時:調出或調入至少要有一邊是他負責的據點(可以把貨調出去,也可以從別店調進來)
export async function POST(request: Request) {
  const me = await getPosUser();
  if (!me) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const denied = await featureDenied('multi_location');
  if (denied) return denied;
  if (!can(me, 'transfer')) return NextResponse.json({ error: '這個帳號沒有「調撥」的權限' }, { status: 403 });
  const shop = await getCurrentShop();
  if (!shop) return NextResponse.json({ error: '找不到這家店' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const db = await shopAdminClient();
  const mine = new Set(allowedLocations(me, await ensureLocations(db)).map((l) => l.id));
  const r = await createTransfer(db, shop.id, { from: body?.from, to: body?.to, lines: body?.lines, note: body?.note, handler: me.label },
    (from, to) => (mine.has(from.id) || mine.has(to.id) ? '' : '只能調撥你負責的據點'));
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ transfer: r.transfer }, { status: 201 });
}
