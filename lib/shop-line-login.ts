import { createLineState, verifyLineState } from '@/lib/line-login';

export const SHOP_LINE_COOKIE = 'shop_line_oauth';

// Bind the signed state to both the shop and initiating browser/member.
export function createShopLineState(shopId: string, userId: string, secret: string) {
  return createLineState('/account', `shop-line:${shopId}:${secret}`, { uid: userId, since: Date.now() });
}

export function verifyShopLineState(state: string, cookie: string | undefined, shopId: string, userId: string, secret: string) {
  if (!state || !cookie || state !== cookie) throw new Error('授權驗證失敗，請回到原瀏覽器重新訂閱');
  const payload = verifyLineState(state, `shop-line:${shopId}:${secret}`);
  if (payload.mode !== 'link' || payload.uid !== userId || payload.issuedAt > Date.now() || payload.next !== '/account') {
    throw new Error('會員授權已失效，請重新訂閱');
  }
}

export async function requireLineFriend(accessToken: string) {
  const response = await fetch('https://api.line.me/friendship/v1/status', {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  if (!response.ok || (await response.json()).friendFlag !== true) {
    throw new Error('請在 LINE 授權畫面加入官方帳號好友後，再重新訂閱');
  }
}
