import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import type { StocktakeLine } from '@/lib/stocktake';
import type { Product, StockMovement, Variant } from '@/lib/types';

export const dynamic = 'force-dynamic';

// POST /api/admin/stocktakes/[id]/complete — 完成盤點:
// 有填實盤數量的項目,依「實盤 − 目前系統庫存」寫入盤點調整紀錄並更新庫存;未盤的項目不動。
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const db = await shopAdminClient();
  const { data: st, error } = await db.from('stocktakes').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!st) return NextResponse.json({ error: '找不到盤點單' }, { status: 404 });
  if (st.status !== 'draft') return NextResponse.json({ error: '這張盤點單已經完成' }, { status: 400 });

  // 先鎖定狀態,避免重複送出造成重複調整
  const { data: locked } = await db.from('stocktakes').update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'draft').select('id');
  if (!locked?.length) return NextResponse.json({ error: '這張盤點單已經完成' }, { status: 409 });

  const lines = st.lines as StocktakeLine[];
  const countedLines = lines.filter((l) => l.counted_qty != null);
  const productIds = [...new Set(countedLines.map((l) => l.product_id))];
  const { data: products, error: pErr } = productIds.length
    ? await db.from('products').select('*').in('id', productIds)
    : { data: [] as Product[], error: null };
  if (pErr) {
    await db.from('stocktakes').update({ status: 'draft', completed_at: null }).eq('id', id);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const working = new Map<string, Product>(((products ?? []) as Product[]).map((p) => [p.id, { ...p, variants: (p.variants ?? []).map((v: Variant) => ({ ...v })) }]));
  const movements: Record<string, unknown>[] = [];
  const nextLines = lines.map((l) => {
    if (l.counted_qty == null) return l;
    const p = working.get(l.product_id);
    if (!p) return { ...l, qty_before: undefined, adjusted: 0 };
    let before: number;
    if (l.variant_key) {
      const v = p.variants.find((x) => x.options.join(' / ') === l.variant_key);
      if (!v) return { ...l, adjusted: 0 };
      before = v.inventory ?? 0;
      v.inventory = l.counted_qty;
      p.inventory = p.variants.reduce((n, x) => n + (x.inventory ?? 0), 0);
    } else {
      before = p.inventory ?? 0;
      p.inventory = l.counted_qty;
    }
    const diff = l.counted_qty - before;
    if (diff !== 0) {
      movements.push({
        product_id: l.product_id,
        variant_key: l.variant_key,
        type: diff > 0 ? 'in' : 'out',
        quantity: Math.abs(diff),
        unit_price: l.cost || 0,
        location: '盤點',
        handler: st.handler || '',
        // 沿用進出庫紀錄的備註格式,紀錄表的「單號」「狀態」欄會顯示盤點單
        note: `單號:${st.doc_no} | 狀態:盤點調整 | 系統 ${before} → 實盤 ${l.counted_qty}`,
      });
    }
    return { ...l, qty_before: before, adjusted: diff };
  });

  const changed = [...working.values()].filter((p) => nextLines.some((l) => l.product_id === p.id && (l.adjusted ?? 0) !== 0));
  for (const p of changed) {
    const { error: upErr } = await db.from('products').update({ inventory: p.inventory, variants: p.variants }).eq('id', p.id);
    if (upErr) return NextResponse.json({ error: `更新 ${p.id} 庫存失敗:${upErr.message}` }, { status: 500 });
  }
  let created: StockMovement[] = [];
  if (movements.length) {
    const { data: mv, error: mvErr } = await db.from('stock_movements').insert(movements).select();
    if (mvErr) console.error('stocktake movements', mvErr.message);
    created = (mv ?? []) as StockMovement[];
  }
  const { data: done } = await db.from('stocktakes').update({ lines: nextLines }).eq('id', id).select().single();

  return NextResponse.json({
    stocktake: done,
    products: changed.map((p) => ({ id: p.id, inventory: p.inventory, variants: p.variants })),
    movements: created,
  });
}
