import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { lineKey, type StocktakeLine } from '@/lib/stocktake';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/stocktakes/[id]
export async function GET(_: Request, { params }: Ctx) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const db = await shopAdminClient();
  const { data, error } = await db.from('stocktakes').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '找不到盤點單' }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/admin/stocktakes/[id] { counts?: { [product_id::variant_key]: number | null }, title?, handler?, note? }
// 只更新有傳的實盤數量(草稿才能改)
export async function PATCH(request: Request, { params }: Ctx) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const db = await shopAdminClient();
  const { data: st, error } = await db.from('stocktakes').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!st) return NextResponse.json({ error: '找不到盤點單' }, { status: 404 });
  if (st.status !== 'draft') return NextResponse.json({ error: '盤點單已完成,不能再修改' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const counts = body?.counts && typeof body.counts === 'object' ? (body.counts as Record<string, unknown>) : null;
  if (counts) {
    patch.lines = (st.lines as StocktakeLine[]).map((l) => {
      const k = lineKey(l);
      if (!(k in counts)) return l;
      const v = counts[k];
      const n = v === null || v === '' ? null : Math.floor(Number(v));
      return { ...l, counted_qty: n === null || !Number.isFinite(n) || n < 0 ? null : n };
    });
  }
  for (const f of ['title', 'handler', 'note'] as const) if (typeof body?.[f] === 'string') patch[f] = body[f].trim();

  const { data, error: upErr } = await db.from('stocktakes').update(patch).eq('id', id).select().single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/stocktakes/[id] — 作廢草稿(已完成的盤點已寫入庫存,不能刪)
export async function DELETE(_: Request, { params }: Ctx) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const db = await shopAdminClient();
  const { data: st } = await db.from('stocktakes').select('status').eq('id', id).maybeSingle();
  if (!st) return NextResponse.json({ error: '找不到盤點單' }, { status: 404 });
  if (st.status !== 'draft') return NextResponse.json({ error: '已完成的盤點單不能刪除' }, { status: 400 });
  const { error } = await db.from('stocktakes').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
