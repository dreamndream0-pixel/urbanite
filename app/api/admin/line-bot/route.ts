import { NextResponse } from 'next/server';
import { getFollowerCount, getQuota, loadBotConfig, loadRules, saveBotConfig } from '@/lib/line-bot';
import { botChannel } from '@/lib/line-channel';
import { withLineBotAdmin } from '@/lib/line-bot-admin';
import { resolveBotConfig, SHOP_DEFAULT_BOT_CONFIG } from '@/lib/line-bot-types';

export const dynamic = 'force-dynamic';

// GET /api/admin/line-bot — 機器人全部設定(設定、規則、選單、推播、額度);主站與店家共用,依網域分店家
export function GET() {
  return withLineBotAdmin(async ({ db, platform, shop }) => {
    const [{ config, raw }, rules, { data: menus }, { data: broadcasts }, quota, followers, channel] = await Promise.all([
      loadBotConfig(),
      loadRules(),
      db.from('line_rich_menus').select('*').order('created_at'),
      db.from('line_broadcasts').select('*').order('created_at', { ascending: false }).limit(50),
      getQuota(),
      getFollowerCount(),
      botChannel(),
    ]);
    return NextResponse.json({
      config,
      rules,
      menus: menus ?? [],
      broadcasts: broadcasts ?? [],
      quota,
      followers,
      ready: Boolean(channel.accessToken && channel.channelSecret),
      notifyStarted: Boolean(raw.notifyCursor),
      platform,
      shopName: shop.name,
    });
  });
}

// PUT /api/admin/line-bot — 儲存設定(歡迎訊息、預設回覆、內建查詢、訂單通知)
export function PUT(request: Request) {
  return withLineBotAdmin(async ({ platform }) => {
    const body = await request.json().catch(() => ({}));
    const config = resolveBotConfig(body.config, platform ? undefined : SHOP_DEFAULT_BOT_CONFIG);
    // 開啟任一訂單通知時,從現在開始計算(不補發舊訂單);這組訂單通知只有主站的舊流程使用
    const { raw } = await loadBotConfig();
    const anyNotify = platform && Object.values(config.notify).some((n) => n.enabled);
    await saveBotConfig({ ...config, ...(anyNotify && !raw.notifyCursor ? { notifyCursor: new Date().toISOString() } : {}) });
    return NextResponse.json({ config });
  });
}
