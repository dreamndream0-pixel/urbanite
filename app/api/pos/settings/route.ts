import { NextResponse } from 'next/server';
import { shopAdminClient } from '@/lib/shop';
import { resolvePosSettings } from '@/lib/pos';
import { allowedLocations, can, getPosUser } from '@/lib/pos-auth';
import { ensureLocations, invoicePatch } from '@/lib/stock-locations';

export const dynamic = 'force-dynamic';

// PUT /api/pos/settings — 儲存 POS 設定(付款方式、收據文字、紙寬、庫存不足是否可賣)
// body.invoice = { location_id, invoice_enabled, invoice_prefix, invoice_next, invoice_end }:同時更新這個據點的發票號碼
export async function PUT(request: Request) {
  const me = await getPosUser();
  if (!me) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (!can(me, 'settings')) return NextResponse.json({ error: '這個帳號沒有「POS 設定」的權限' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const settings = resolvePosSettings(body);
  const supabase = await shopAdminClient();

  let locations = await ensureLocations(supabase);
  const inv = body?.invoice && typeof body.invoice === 'object' ? (body.invoice as Record<string, unknown>) : null;
  if (inv && me.features.invoice) {
    const target = allowedLocations(me, locations).find((l) => l.id === inv.location_id);
    if (!target) return NextResponse.json({ error: '找不到據點' }, { status: 404 });
    const checked = invoicePatch(inv);
    if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });
    const next = { ...target, ...checked.patch } as typeof target;
    if (next.invoice_enabled && !next.invoice_prefix) return NextResponse.json({ error: '請先填發票字軌' }, { status: 400 });
    if (next.invoice_enabled && next.invoice_next > next.invoice_end) return NextResponse.json({ error: '下一張號碼不能大於結束號碼' }, { status: 400 });
    const { error } = await supabase.from('stock_locations').update(checked.patch ?? {}).eq('id', target.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    locations = await ensureLocations(supabase);
  }

  const { data, error } = await supabase.from('site_settings').update({ pos_settings: settings }).not('id', 'is', null).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: '找不到這家店的設定' }, { status: 404 });
  return NextResponse.json({ settings, locations: allowedLocations(me, locations.filter((l) => l.active)) });
}
