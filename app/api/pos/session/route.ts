import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { openSession, sessionWithSummary } from '@/lib/pos-server';
import type { PosCashMove, PosSession } from '@/lib/pos';
import { ensureLocations, pickLocation } from '@/lib/stock-locations';

export const dynamic = 'force-dynamic';

const cashAmount = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isSafeInteger(n) && n >= 0 && n <= 99_999_999 ? n : null;
};

// 每個據點(分店 / 倉庫)各自一班:GET 用 ?location=,POST / PATCH 用 body.location_id
// GET /api/pos/session — 目前營業中的班別(含即時摘要);?history=1 另外帶最近 30 筆交班紀錄
export async function GET(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const supabase = await shopAdminClient();
  const url = new URL(request.url);
  const location = pickLocation(await ensureLocations(supabase), url.searchParams.get('location'));
  const session = await openSession(supabase, location);
  const current = session ? await sessionWithSummary(supabase, session) : null;
  let history: PosSession[] = [];
  if (url.searchParams.has('history')) {
    const closed = supabase.from('pos_sessions').select('*').eq('status', 'closed');
    const { data } = await (location.is_default ? closed.or(`location_id.eq.${location.id},location_id.is.null`) : closed.eq('location_id', location.id)).order('closed_at', { ascending: false }).limit(30);
    history = (data ?? []) as PosSession[];
  }
  return NextResponse.json({ session: current, history }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST /api/pos/session { opening_cash } — 開班
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const opening = cashAmount(body?.opening_cash ?? 0);
  if (opening === null) return NextResponse.json({ error: '零用金金額不正確' }, { status: 400 });
  const supabase = await shopAdminClient();
  const location = pickLocation(await ensureLocations(supabase), body?.location_id);
  if (await openSession(supabase, location)) return NextResponse.json({ error: '已經有營業中的班別,請先交班' }, { status: 409 });
  const { data, error } = await supabase.from('pos_sessions').insert({ opened_by: admin.email ?? '', opening_cash: opening, location_id: location.id }).select().single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? '已經有營業中的班別,請先交班' : error.message }, { status: 409 });
  return NextResponse.json({ session: await sessionWithSummary(supabase, data as PosSession) }, { status: 201 });
}

// PATCH /api/pos/session
// { action:'move', type:'in'|'out', amount, note } — 現金存入 / 取出
// { action:'close', counted_cash, note } — 交班:記下點鈔金額、應有現金與差額
export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const supabase = await shopAdminClient();
  const session = await openSession(supabase, pickLocation(await ensureLocations(supabase), body?.location_id));
  if (!session) return NextResponse.json({ error: '目前沒有營業中的班別' }, { status: 409 });
  const actor = admin.email ?? '';

  if (body?.action === 'move') {
    const amount = cashAmount(body?.amount);
    if (!amount) return NextResponse.json({ error: '請輸入金額' }, { status: 400 });
    const move: PosCashMove = { at: new Date().toISOString(), type: body?.type === 'out' ? 'out' : 'in', amount, note: String(body?.note ?? '').trim().slice(0, 100), by: actor };
    const { data, error } = await supabase.from('pos_sessions').update({ cash_moves: [...(session.cash_moves ?? []), move] }).eq('id', session.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session: await sessionWithSummary(supabase, data as PosSession) });
  }

  if (body?.action === 'close') {
    const counted = cashAmount(body?.counted_cash);
    if (counted === null) return NextResponse.json({ error: '請輸入點鈔金額' }, { status: 400 });
    const { summary } = await sessionWithSummary(supabase, session);
    const { data, error } = await supabase.from('pos_sessions').update({
      status: 'closed', closed_by: actor, closed_at: new Date().toISOString(), counted_cash: counted,
      expected_cash: summary.expectedCash, difference: counted - summary.expectedCash, summary,
      note: String(body?.note ?? '').trim().slice(0, 300),
    }).eq('id', session.id).eq('status', 'open').select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session: null, closed: data as PosSession });
  }

  return NextResponse.json({ error: '不支援的操作' }, { status: 400 });
}
