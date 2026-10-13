import { createLineState, verifyLineState } from '@/lib/line-login';
import { createHash, createHmac } from 'node:crypto';

export const SHOP_LINE_COOKIE = 'shop_line_oauth';

// Only the authenticated start route can mint this shop/member-bound state.
// v2 excludes older flows that did not require PKCE.
export function createShopLineState(shopId: string, userId: string, secret: string) {
  return createLineState('/account', `shop-line-v2:${shopId}:${secret}`, { uid: userId, since: Date.now() });
}

export function verifyShopLineState(state: string, shopId: string, secret: string, sessionUserId?: string) {
  const payload = verifyLineState(state, `shop-line-v2:${shopId}:${secret}`);
  if (payload.mode !== 'link' || typeof payload.uid !== 'string' || !payload.uid ||
    (sessionUserId && payload.uid !== sessionUserId) || !Number.isFinite(payload.issuedAt) ||
    payload.issuedAt > Date.now() || !Number.isFinite(payload.since) || !payload.since ||
    payload.since > payload.issuedAt || !/^[a-f0-9]{32}$/.test(payload.nonce) || payload.next !== '/account') {
    throw new Error('會員授權已失效，請重新訂閱');
  }
  return { userId: payload.uid, since: payload.since };
}

// Recoverable only on the server, never in a browser cookie or authorization URL.
// A code issued for another authorization request cannot be swapped into this flow.
export function shopLinePkce(state: string, shopId: string, secret: string) {
  const verifier = createHmac('sha256', secret).update(`shop-line-pkce-v2:${shopId}:${state}`).digest('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export async function requireLineFriend(accessToken: string) {
  const response = await fetch('https://api.line.me/friendship/v1/status', {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
  });
  if (!response.ok || (await response.json()).friendFlag !== true) {
    throw new Error('請在 LINE 授權畫面加入官方帳號好友後，再重新訂閱');
  }
}
