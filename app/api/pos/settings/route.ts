import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { resolvePosSettings } from '@/lib/pos';

export const dynamic = 'force-dynamic';

// PUT /api/pos/settings — 儲存 POS 設定(付款方式、收據文字、紙寬、庫存不足是否可賣)
export async function PUT(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const settings = resolvePosSettings(await request.json().catch(() => null));
  const supabase = await shopAdminClient();
  const { data, error } = await supabase.from('site_settings').update({ pos_settings: settings }).not('id', 'is', null).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: '找不到這家店的設定' }, { status: 404 });
  return NextResponse.json(settings);
}
