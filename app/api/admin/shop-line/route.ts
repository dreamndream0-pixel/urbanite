import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, isPlatformShop, shopUrl } from '@/lib/shop';
import { fetchBotInfo, getShopLineConfig, saveShopLineConfig } from '@/lib/shop-line';

export const dynamic = 'force-dynamic';

// 店家後台「服務設定」:店家自己的 LINE 官方帳號金鑰(只寫不讀,前端只看到狀態)
async function context() {
  const admin = await getAdminUser();
  const shop = await getCurrentShop();
  if (!admin || !shop) return null;
  if (isPlatformShop(shop)) return 'platform' as const;
  return shop;
}

async function status(shop: { id: string; slug: string }) {
  const cfg = await getShopLineConfig(shop.id);
  const info = cfg ? await fetchBotInfo(cfg.accessToken) : null;
  return {
    configured: Boolean(cfg),
    valid: Boolean(info),
    botName: info?.displayName ?? '',
    basicId: info?.basicId ?? '',
    webhookUrl: shopUrl(shop.slug, '/api/line/webhook'),
  };
}

export async function GET() {
  const shop = await context();
  if (!shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (shop === 'platform') return NextResponse.json({ error: '主站的 LINE 在「串接設定」設定' }, { status: 400 });
  return NextResponse.json(await status(shop), { headers: { 'Cache-Control': 'no-store' } });
}

// PUT { channelSecret, accessToken } — 先向 LINE 驗證 token,正確才儲存
export async function PUT(request: Request) {
  const shop = await context();
  if (!shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (shop === 'platform') return NextResponse.json({ error: '主站的 LINE 在「串接設定」設定' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const channelSecret = String(body?.channelSecret ?? '').trim();
  const accessToken = String(body?.accessToken ?? '').trim();
  if (!/^[a-f0-9]{32}$/i.test(channelSecret)) return NextResponse.json({ error: 'Channel secret 格式不對(應為 32 碼英數字)' }, { status: 400 });
  if (accessToken.length < 20 || accessToken.length > 400) return NextResponse.json({ error: 'Channel access token 格式不對' }, { status: 400 });
  const info = await fetchBotInfo(accessToken);
  if (!info) return NextResponse.json({ error: 'LINE 驗證失敗:Channel access token 無效,請到 LINE Developers 重新發行後再貼上' }, { status: 400 });
  await saveShopLineConfig(shop.id, { channelSecret, accessToken });
  return NextResponse.json(await status(shop));
}

export async function DELETE() {
  const shop = await context();
  if (!shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (shop === 'platform') return NextResponse.json({ error: '主站的 LINE 在「串接設定」設定' }, { status: 400 });
  await saveShopLineConfig(shop.id, null);
  return NextResponse.json(await status(shop));
}
