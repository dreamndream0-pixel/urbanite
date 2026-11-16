import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { ensureLocations, loadLevels } from '@/lib/stock-locations';

export const dynamic = 'force-dynamic';

// 發票字軌:兩個大寫英文字母;號碼 1 ~ 99999999
function invoicePatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if ('invoice_enabled' in body) patch.invoice_enabled = body.invoice_enabled === true;
  if ('invoice_prefix' in body) {
    const prefix = String(body.invoice_prefix ?? '').trim().toUpperCase();
    if (prefix && !/^[A-Z]{2}$/.test(prefix)) return { error: '發票字軌是兩個英文字母(例:AB)' };
    patch.invoice_prefix = prefix;
  }
  for (const key of ['invoice_next', 'invoice_end'] as const) {
    if (!(key in body)) continue;
    const n = Math.floor(Number(body[key]));
    if (!Number.isSafeInteger(n) || n < 0 || n > 99_999_999) return { error: '發票號碼是 8 位數以內的數字' };
    patch[key] = n;
  }
  return { patch };
}

// GET /api/admin/stock-locations — 據點列表;?levels=1 另外帶各據點庫存(非預設據點)
export async function GET(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const db = await shopAdminClient();
  const locations = await ensureLocations(db);
  const levels = new URL(request.url).searchParams.has('levels') ? await loadLevels(db) : [];
  return NextResponse.json({ locations, levels }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST /api/admin/stock-locations { name, kind } — 新增分店 / 倉庫
export async function POST(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? '').trim().slice(0, 30);
  if (!name) return NextResponse.json({ error: '請輸入名稱' }, { status: 400 });
  const db = await shopAdminClient();
  const locations = await ensureLocations(db);
  if (locations.some((l) => l.name === name)) return NextResponse.json({ error: '已經有同名的據點' }, { status: 409 });
  if (locations.length >= 30) return NextResponse.json({ error: '據點數量已達上限' }, { status: 400 });
  const { error } = await db.from('stock_locations').insert({ name, kind: body?.kind === 'warehouse' ? 'warehouse' : 'store', sort_order: locations.length });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: await ensureLocations(db) }, { status: 201 });
}

// PATCH /api/admin/stock-locations { id, name?, kind?, active?, note?, invoice_* } — 修改據點、發票號碼設定
export async function PATCH(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(body?.id ?? '');
  const db = await shopAdminClient();
  const locations = await ensureLocations(db);
  const target = locations.find((l) => l.id === id);
  if (!body || !target) return NextResponse.json({ error: '找不到據點' }, { status: 404 });

  const invoice = invoicePatch(body);
  if (invoice.error) return NextResponse.json({ error: invoice.error }, { status: 400 });
  const patch: Record<string, unknown> = { ...invoice.patch };
  if ('name' in body) {
    const name = String(body.name ?? '').trim().slice(0, 30);
    if (!name) return NextResponse.json({ error: '請輸入名稱' }, { status: 400 });
    if (locations.some((l) => l.id !== id && l.name === name)) return NextResponse.json({ error: '已經有同名的據點' }, { status: 409 });
    patch.name = name;
  }
  if ('kind' in body) patch.kind = body.kind === 'warehouse' ? 'warehouse' : 'store';
  if ('note' in body) patch.note = String(body.note ?? '').slice(0, 200);
  if ('active' in body) {
    if (target.is_default && body.active === false) return NextResponse.json({ error: '預設據點不能停用' }, { status: 400 });
    patch.active = body.active !== false;
  }
  const next = { ...target, ...patch } as typeof target;
  if (next.invoice_enabled && !next.invoice_prefix) return NextResponse.json({ error: '請先填發票字軌' }, { status: 400 });
  if (next.invoice_enabled && next.invoice_next > next.invoice_end) return NextResponse.json({ error: '下一張號碼不能大於結束號碼' }, { status: 400 });
  const { error } = await db.from('stock_locations').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: await ensureLocations(db) });
}

// DELETE /api/admin/stock-locations?id= — 刪除據點(還有庫存或是預設據點不能刪)
export async function DELETE(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const db = await shopAdminClient();
  const locations = await ensureLocations(db);
  const target = locations.find((l) => l.id === id);
  if (!target) return NextResponse.json({ error: '找不到據點' }, { status: 404 });
  if (target.is_default) return NextResponse.json({ error: '預設據點不能刪除' }, { status: 400 });
  const { count } = await db.from('stock_levels').select('product_id', { count: 'exact', head: true }).eq('location_id', id).gt('quantity', 0);
  if (count) return NextResponse.json({ error: '這個據點還有庫存,請先調貨到其他據點' }, { status: 409 });
  const { error } = await db.from('stock_locations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: await ensureLocations(db) });
}
