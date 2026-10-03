import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { PANEL_UNLOCK_COOKIE, setPanelPassword, verifyPanelPassword, verifyUnlockToken } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

// POST { current, next } — 修改串接設定密碼(需已解鎖,並再次確認目前密碼)
export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin?.email) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (!verifyUnlockToken(request.cookies.get(PANEL_UNLOCK_COOKIE)?.value, admin.email)) {
    return NextResponse.json({ error: '請先輸入串接設定密碼', locked: true }, { status: 423 });
  }
  const body = await request.json().catch(() => ({}));
  const current = String(body?.current ?? '');
  const next = String(body?.next ?? '');
  if (next.length < 6) return NextResponse.json({ error: '新密碼至少 6 碼' }, { status: 400 });
  if (!(await verifyPanelPassword(current))) return NextResponse.json({ error: '目前密碼錯誤' }, { status: 403 });
  try {
    await setPanelPassword(next);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '修改失敗' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
