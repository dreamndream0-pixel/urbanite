import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { featureDenied } from '@/lib/pos-auth';
import { shopAdminClient } from '@/lib/shop';
import { resolvePosButtons } from '@/lib/pos';

export const dynamic = 'force-dynamic';

// GET /api/pos/buttons — POS 首頁按鈕
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const denied = await featureDenied('pos');
  if (denied) return denied;
  const { data } = await (await shopAdminClient()).from('site_settings').select('pos_buttons').maybeSingle();
  return NextResponse.json(resolvePosButtons(data?.pos_buttons), { headers: { 'Cache-Control': 'private, no-store' } });
}

// PUT /api/pos/buttons — 儲存 POS 首頁按鈕(名稱、顏色、底下的商品)
export async function PUT(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const denied = await featureDenied('pos');
  if (denied) return denied;
  const buttons = resolvePosButtons(await request.json().catch(() => null));
  const { data, error } = await (await shopAdminClient()).from('site_settings').update({ pos_buttons: buttons }).not('id', 'is', null).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: '找不到這家店的設定' }, { status: 404 });
  return NextResponse.json(buttons);
}
