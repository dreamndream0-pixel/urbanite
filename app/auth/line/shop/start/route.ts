import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { getCurrentShop, isPlatformShop, shopUrl } from '@/lib/shop';
import { getShopLineConfig } from '@/lib/shop-line';
import { createShopLineState, SHOP_LINE_COOKIE } from '@/lib/shop-line-login';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended' || isPlatformShop(shop)) return NextResponse.json({ error: '找不到商店' }, { status: 404 });
  const canonical = shopUrl(shop.slug, '/auth/line/shop/start');
  if (new URL(request.url).origin !== new URL(canonical).origin) return NextResponse.redirect(canonical);
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(shopUrl(shop.slug, '/login?next=%2Fauth%2Fline%2Fshop%2Fstart'));
  const cfg = await getShopLineConfig(shop.id);
  if (!cfg?.loginChannelId || !cfg.loginChannelSecret || !cfg.accessToken) {
    return NextResponse.redirect(shopUrl(shop.slug, `/account?line_error=${encodeURIComponent('商店尚未設定 LINE 自動綁定')}`));
  }
  const state = createShopLineState(shop.id, user.id, cfg.loginChannelSecret);
  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: cfg.loginChannelId,
    redirect_uri: shopUrl(shop.slug, '/auth/line/shop/callback'), state, scope: 'profile', bot_prompt: 'aggressive' }).toString();
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store');
  response.cookies.set(SHOP_LINE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/line/shop', maxAge: 600 });
  return response;
}
