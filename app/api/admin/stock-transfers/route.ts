import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { featureDenied } from '@/lib/pos-auth';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { createTransfer, loadLevels } from '@/lib/stock-locations';

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
  const r = await createTransfer(db, shop.id, { from: body?.from, to: body?.to, lines: body?.lines, note: body?.note, handler: admin.email ?? '' });
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ transfer: r.transfer, levels: await loadLevels(db) }, { status: 201 });
}
