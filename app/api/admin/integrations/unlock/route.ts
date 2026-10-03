import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import {
  createUnlockToken,
  isDefaultPanelPassword,
  PANEL_UNLOCK_COOKIE,
  verifyPanelPassword,
  verifyUnlockToken,
} from '@/lib/integrations';

export const dynamic = 'force-dynamic';

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/admin/integrations' };

// GET — 目前是否已解鎖
export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin?.email) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const unlocked = verifyUnlockToken(request.cookies.get(PANEL_UNLOCK_COOKIE)?.value, admin.email);
  return NextResponse.json({ unlocked, defaultPassword: unlocked ? await isDefaultPanelPassword() : undefined });
}

// POST { password } — 輸入密碼解鎖(30 分鐘)
export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin?.email) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const password = String(body?.password ?? '');
  // 減緩暴力嘗試
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!password || !(await verifyPanelPassword(password))) {
    return NextResponse.json({ error: '密碼錯誤' }, { status: 403 });
  }
  const { token, maxAge } = createUnlockToken(admin.email);
  const response = NextResponse.json({ unlocked: true, defaultPassword: await isDefaultPanelPassword() });
  response.cookies.set(PANEL_UNLOCK_COOKIE, token, { ...cookieOptions, maxAge });
  return response;
}

// DELETE — 手動上鎖
export async function DELETE() {
  const response = NextResponse.json({ unlocked: false });
  response.cookies.set(PANEL_UNLOCK_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
