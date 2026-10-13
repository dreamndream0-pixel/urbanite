import { NextResponse, type NextRequest } from 'next/server';
import { PANEL_UNLOCK_COOKIE, verifyUnlockToken } from '@/lib/integrations';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, isPlatformShop, shopUrl } from '@/lib/shop';
import { fetchBotInfo, getShopLineConfig, saveShopLineConfig } from '@/lib/shop-line';

export const dynamic = 'force-dynamic';

// 店家後台「服務設定」:店家自己的 LINE 官方帳號金鑰(只寫不讀,前端只看到狀態)
// 需先用主站串接設定密碼解鎖(/api/admin/shop-line/unlock)
async function context(request: NextRequest) {
  const admin = await getAdminUser();
  const shop = await getCurrentShop();
  if (!admin?.email || !shop) return null;
  if (!verifyUnlockToken(request.cookies.get(PANEL_UNLOCK_COOKIE)?.value, admin.email)) return 'locked' as const;
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
    loginConfigured: Boolean(cfg?.loginChannelId && cfg?.loginChannelSecret),
    callbackUrl: shopUrl(shop.slug, '/auth/line/shop/callback'),
  };
}

const locked = () => NextResponse.json({ error: '請先輸入服務設定密碼', locked: true }, { status: 423 });

export async function GET(request: NextRequest) {
  const shop = await context(request);
  if (!shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (shop === 'locked') return locked();
  if (shop === 'platform') return NextResponse.json({ error: '主站的 LINE 在「串接設定」設定' }, { status: 400 });
  return NextResponse.json(await status(shop), { headers: { 'Cache-Control': 'no-store' } });
}

// PUT { channelSecret, accessToken } — 先向 LINE 驗證 token,正確才儲存
export async function PUT(request: NextRequest) {
  const shop = await context(request);
  if (!shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (shop === 'locked') return locked();
  if (shop === 'platform') return NextResponse.json({ error: '主站的 LINE 在「串接設定」設定' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const previous = await getShopLineConfig(shop.id);
  const channelSecret = String(body?.channelSecret ?? '').trim() || previous?.channelSecret || '';
  const accessToken = String(body?.accessToken ?? '').trim() || previous?.accessToken || '';
  const newLoginId = String(body?.loginChannelId ?? '').trim();
  const newLoginSecret = String(body?.loginChannelSecret ?? '').trim();
  if (Boolean(newLoginId) !== Boolean(newLoginSecret)) return NextResponse.json({ error: '更換 LINE Login 時請同時填寫 Channel ID 和 Channel secret' }, { status: 400 });
  const loginChannelId = newLoginId || previous?.loginChannelId;
  const loginChannelSecret = newLoginSecret || previous?.loginChannelSecret;
  if (loginChannelId && (!/^\d{5,20}$/.test(loginChannelId) || !/^[a-f0-9]{32}$/i.test(loginChannelSecret ?? ''))) return NextResponse.json({ error: 'LINE Login Channel ID 或 secret 格式不正確' }, { status: 400 });
  if (!/^[a-f0-9]{32}$/i.test(channelSecret)) return NextResponse.json({ error: 'Channel secret 格式不對(應為 32 碼英數字)' }, { status: 400 });
  if (accessToken.length < 20 || accessToken.length > 400) return NextResponse.json({ error: 'Channel access token 格式不對' }, { status: 400 });
  const info = await fetchBotInfo(accessToken);
  if (!info) return NextResponse.json({ error: 'LINE 驗證失敗:Channel access token 無效,請到 LINE Developers 重新發行後再貼上' }, { status: 400 });
  await saveShopLineConfig(shop.id, { channelSecret, accessToken, loginChannelId, loginChannelSecret });
  return NextResponse.json(await status(shop));
}

export async function DELETE(request: NextRequest) {
  const shop = await context(request);
  if (!shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (shop === 'locked') return locked();
  if (shop === 'platform') return NextResponse.json({ error: '主站的 LINE 在「串接設定」設定' }, { status: 400 });
  await saveShopLineConfig(shop.id, null);
  return NextResponse.json(await status(shop));
}
