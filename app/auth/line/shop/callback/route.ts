import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { getCurrentShop, isPlatformShop, shopUrl } from '@/lib/shop';
import { bindShopLine, getShopLineConfig } from '@/lib/shop-line';
import { exchangeLineCode, fetchLineProfile } from '@/lib/line-login';
import { fetchBotProfile } from '@/lib/line-messaging';
import { requireLineFriend, SHOP_LINE_COOKIE, verifyShopLineState } from '@/lib/shop-line-login';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended' || isPlatformShop(shop)) return NextResponse.json({ error: '找不到商店' }, { status: 404 });
  const target = new URL(shopUrl(shop.slug, '/account'));
  try {
    const user = await getSessionUser();
    if (!user) throw new Error('登入已失效，請回到原瀏覽器登入後重新訂閱');
    const cfg = await getShopLineConfig(shop.id);
    if (!cfg?.loginChannelId || !cfg.loginChannelSecret || !cfg.accessToken) throw new Error('商店尚未設定 LINE 自動綁定');
    verifyShopLineState(request.nextUrl.searchParams.get('state') ?? '', request.cookies.get(SHOP_LINE_COOKIE)?.value, shop.id, user.id, cfg.loginChannelSecret);
    const code = request.nextUrl.searchParams.get('code');
    if (request.nextUrl.searchParams.has('error') || !code) throw new Error('尚未完成 LINE 授權，請重新訂閱');
    const token = await exchangeLineCode({ code, redirectUri: shopUrl(shop.slug, '/auth/line/shop/callback'), channelId: cfg.loginChannelId, channelSecret: cfg.loginChannelSecret });
    await requireLineFriend(token);
    const profile = await fetchLineProfile(token);
    // Messaging API must recognize this exact Login identity: providers/bots must match.
    const botProfile = await fetchBotProfile(profile.userId, cfg.accessToken).catch(() => null);
    if (!botProfile || botProfile.userId !== profile.userId) throw new Error('無法確認官方帳號好友，請確認已加入此商店的 LINE，或聯絡商店檢查 LINE 設定');
    await bindShopLine(shop, cfg, user.id, user.email ?? '', profile.userId);
    target.searchParams.set('line', 'linked');
  } catch (error) {
    // Do not expose provider token-exchange responses or credentials to the URL.
    const message = error instanceof Error && /^(授權驗證|會員授權|登入已失效|商店尚未|尚未完成|請在 LINE|無法確認|這個 LINE)/.test(error.message)
      ? error.message : 'LINE 綁定未完成，請重新訂閱；若持續失敗請聯絡商店';
    target.searchParams.set('line_error', message);
  }
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(SHOP_LINE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/line/shop', maxAge: 0 });
  return response;
}
