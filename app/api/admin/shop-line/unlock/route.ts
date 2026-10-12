import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { accountRateLimit, rateLimitResponse } from '@/lib/account-rate-limit';
import { createUnlockToken, PANEL_UNLOCK_COOKIE, verifyPanelPassword, verifyUnlockToken } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

// 店家「服務設定」與主站「串接設定」共用同一組密碼(工程師才知道),解鎖 30 分鐘
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/admin/shop-line' };

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin?.email) return NextResponse.json({ error: '未授權' }, { status: 401 });
  return NextResponse.json({ unlocked: verifyUnlockToken(request.cookies.get(PANEL_UNLOCK_COOKIE)?.value, admin.email) });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin?.email) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (!accountRateLimit(admin.id, 'shop-line-unlock', 5)) return rateLimitResponse();
  const body = await request.json().catch(() => ({}));
  const password = String(body?.password ?? '');
  await new Promise((resolve) => setTimeout(resolve, 400)); // 減緩暴力嘗試
  if (!password || !(await verifyPanelPassword(password))) return NextResponse.json({ error: '密碼錯誤' }, { status: 403 });
  const { token, maxAge } = createUnlockToken(admin.email);
  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(PANEL_UNLOCK_COOKIE, token, { ...cookieOptions, maxAge });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ unlocked: false });
  response.cookies.set(PANEL_UNLOCK_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
