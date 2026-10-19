import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerBusiness } from '@/lib/booking/server';
import { newPortalToken } from '@/lib/booking/staff-portal';

export const dynamic = 'force-dynamic';

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

// POST /api/mycard/booking/staff/portal { id, action: 'create' | 'reset' | 'off' } — 人員專屬頁連結:產生、重設(舊連結失效)、關閉
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const business = await ownerBusiness(user.id);
  if (!business) return err(404, 'NOT_FOUND', '請先完成預約設定。');
  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: staff } = await db.from('bk_staff').select('id, portal_token').eq('id', String(body?.id ?? '')).eq('business_id', business.id).maybeSingle();
  if (!staff) return err(404, 'NOT_FOUND', '找不到這位人員。');
  const token = body?.action === 'off' ? null : body?.action === 'create' && staff.portal_token ? staff.portal_token : newPortalToken();
  const { error } = await db.from('bk_staff').update({ portal_token: token }).eq('id', staff.id);
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json({ token });
}
