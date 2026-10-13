import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { getCurrentShop, isPlatformShop, scopedClient, shopUrl } from '@/lib/shop';
import { bindShopLine, getShopLineConfig } from '@/lib/shop-line';
import { exchangeLineCode, fetchLineProfile } from '@/lib/line-login';
import { fetchBotProfile } from '@/lib/line-messaging';
import { LINE_FRIEND_ERROR, lineFriendFlag, SHOP_LINE_COOKIE, shopLinePkce, verifyShopLineState } from '@/lib/shop-line-login';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended' || isPlatformShop(shop)) return NextResponse.json({ error: '找不到商店' }, { status: 404 });
  const target = new URL(shopUrl(shop.slug, '/auth/line/shop/result'));
  try {
    const session = await getSessionUser();
    const cfg = await getShopLineConfig(shop.id);
    if (!cfg?.loginChannelId || !cfg.loginChannelSecret || !cfg.accessToken) throw new Error('商店尚未設定 LINE 自動綁定');
    const state = request.nextUrl.searchParams.get('state') ?? '';
    const { userId, since } = verifyShopLineState(state, shop.id, cfg.loginChannelSecret, session?.id);
    const code = request.nextUrl.searchParams.get('code');
    if (request.nextUrl.searchParams.has('error') || !code) throw new Error('尚未完成 LINE 授權，請重新訂閱');
    const db = scopedClient(shop.id);
    const { data: member, error: memberError } = await db.auth.admin.getUserById(userId);
    if (memberError || !member.user || (member.user.banned_until && new Date(member.user.banned_until).getTime() > Date.now())) throw new Error('會員授權已失效，請重新訂閱');
    const { data: customer, error: customerError } = await db.from('customers').select('line_bound_at').eq('user_id', userId).maybeSingle();
    if (customerError || (customer?.line_bound_at && new Date(customer.line_bound_at).getTime() >= since)) throw new Error('會員授權已失效，請重新訂閱');
    const { verifier } = shopLinePkce(state, shop.id, cfg.loginChannelSecret);
    const token = await exchangeLineCode({ code, redirectUri: shopUrl(shop.slug, '/auth/line/shop/callback'), channelId: cfg.loginChannelId, channelSecret: cfg.loginChannelSecret, codeVerifier: verifier });
    const friendFlag = await lineFriendFlag(token);
    const profile = await fetchLineProfile(token);
    // Messaging API must recognize this exact Login identity: providers/bots must match.
    const botProfile = await fetchBotProfile(profile.userId, cfg.accessToken).catch(() => null);
    if (!botProfile || botProfile.userId !== profile.userId) {
      const probe = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(profile.userId)}`, { headers: { Authorization: `Bearer ${cfg.accessToken}` } }).catch(() => null);
      console.error('shop LINE bind not friend', { shop: shop.slug, friendFlag, botProfileStatus: probe?.status ?? 'network', botProfileError: (await probe?.text().catch(() => '') ?? '').slice(0, 200) });
      throw new Error(friendFlag ? '無法確認官方帳號好友，請確認已加入此商店的 LINE，或聯絡商店檢查 LINE 設定' : LINE_FRIEND_ERROR);
    }
    if (friendFlag !== true) console.warn('shop LINE friendFlag mismatch; check Linked LINE Official Account', { shop: shop.slug, friendFlag });
    await bindShopLine(shop, cfg, userId, member.user.email ?? '', profile.userId);
    target.searchParams.set('ok', '1');
  } catch (error) {
    // Do not expose provider token-exchange responses or credentials to the URL.
    const message = error instanceof Error && /^(授權驗證|會員授權|登入已失效|商店尚未|尚未完成|請在 LINE|無法確認|這個 LINE)/.test(error.message)
      ? error.message : 'LINE 綁定未完成，請重新訂閱；若持續失敗請聯絡商店';
    target.searchParams.set('error', message);
  }
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(SHOP_LINE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/line/shop', maxAge: 0 });
  return response;
}
