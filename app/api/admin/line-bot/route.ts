import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { getFollowerCount, getQuota, loadBotConfig, loadRules, saveBotConfig } from '@/lib/line-bot';
import { getMessagingConfig } from '@/lib/line-messaging';
import { resolveBotConfig } from '@/lib/line-bot-types';

export const dynamic = 'force-dynamic';

// GET /api/admin/line-bot — 機器人全部設定(設定、規則、選單、推播、額度)
export async function GET() {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const supabase = createAdminClient();
  const [{ config, raw }, rules, { data: menus }, { data: broadcasts }, quota, followers, messaging] = await Promise.all([
    loadBotConfig(),
    loadRules(),
    supabase.from('line_rich_menus').select('*').order('created_at'),
    supabase.from('line_broadcasts').select('*').order('created_at', { ascending: false }).limit(50),
    getQuota(),
    getFollowerCount(),
    getMessagingConfig(),
  ]);
  return NextResponse.json({
    config,
    rules,
    menus: menus ?? [],
    broadcasts: broadcasts ?? [],
    quota,
    followers,
    ready: Boolean(messaging.accessToken && messaging.channelSecret),
    notifyStarted: Boolean(raw.notifyCursor),
  });
}

// PUT /api/admin/line-bot — 儲存設定(歡迎訊息、預設回覆、內建查詢、訂單通知)
export async function PUT(request: Request) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const config = resolveBotConfig(body.config);
  try {
    // 開啟任一訂單通知時,從現在開始計算(不補發舊訂單)
    const { raw } = await loadBotConfig();
    const anyNotify = Object.values(config.notify).some((n) => n.enabled);
    await saveBotConfig({ ...config, ...(anyNotify && !raw.notifyCursor ? { notifyCursor: new Date().toISOString() } : {}) });
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '儲存失敗' }, { status: 400 });
  }
}
