import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicBusiness } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

// POST /api/booking/my/prefs { slug, marketing_opt_out } — 顧客設定是否接收這家店的回訪 / 感謝訊息(預約通知不受影響)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ctx = await getPublicBusiness(String(body?.slug ?? ''));
  if (!ctx) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '找不到這家店。' } }, { status: 404 });
  const { data } = await createAdminClient().from('bk_customers').update({ marketing_opt_out: Boolean(body?.marketing_opt_out), updated_at: new Date().toISOString() })
    .eq('business_id', ctx.business.id).eq('user_id', user.id).select('id');
  if (!data?.length) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '你在這家店還沒有預約紀錄。' } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
