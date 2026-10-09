import { NextRequest, NextResponse } from 'next/server';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { listIntegrationStatus, PANEL_UNLOCK_COOKIE, saveIntegrations, verifyUnlockToken } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

// 需為管理員,且已輸入串接設定密碼解鎖
async function authorize(request: NextRequest) {
  const admin = await getPlatformAdmin();
  if (!admin?.email) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (!verifyUnlockToken(request.cookies.get(PANEL_UNLOCK_COOKIE)?.value, admin.email)) {
    return NextResponse.json({ error: '請先輸入串接設定密碼', locked: true }, { status: 423 });
  }
  return null;
}

// GET /api/admin/integrations — 各串接設定的狀態(金鑰只回傳遮罩,不回傳完整值)
export async function GET(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  return NextResponse.json(await listIntegrationStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

// PATCH /api/admin/integrations { KEY: value } — 空字串代表清除(恢復使用主機環境變數)
export async function PATCH(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '資料格式錯誤' }, { status: 400 });
  try {
    await saveIntegrations(body as Record<string, string>);
  } catch (error) {
    const message = error instanceof Error ? error.message : '儲存失敗';
    const hint = /integration_settings/.test(message) ? '(資料表尚未建立,請先執行 migration-integration-settings.sql)' : '';
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
  return NextResponse.json(await listIntegrationStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
