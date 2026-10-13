# Shop LINE subscription

The account subscription button starts shop-specific LINE Login, prompts for adding
the linked official account, checks friendship and Messaging API identity, then
binds the currently signed-in buyer within that shop. It never transfers another
buyer's existing LINE binding. The existing chat binding flow remains supported.

## Required configuration

In the shop admin service settings, retain the Messaging API credentials and add
the LINE Login Channel ID and secret. Secrets are encrypted and write-only.
Blank fields preserve existing credentials; replacing a Login channel requires
both its ID and secret.

In LINE Developers:

1. Create a LINE Login web channel under the same Provider as the shop's Messaging API channel.
2. Link that shop's official account to the Login channel and publish the channel.
3. Register the exact Callback URL displayed in the shop service settings:
   `https://<shop>.urbanite.com.tw/auth/line/shop/callback`.
4. Test using a designated buyer account: subscribe, consent, add friend, return
   to the account page and confirm the binding. Also test an existing friend,
   declined consent, blocked account, and attempted binding to another member.

LINE requires the user's consent; adding a friend cannot be forced. Until Login
credentials are configured, the subscription button is disabled. Saving the keys
does not prove the external Login channel, callback, and Provider are configured.

The callback requires the initiating browser's short-lived HttpOnly state cookie
and the same signed-in member. Browser/session changes fail closed and ask the
buyer to retry in the original browser. OAuth codes are single-use, state expires
after ten minutes, and the cookie is cleared after the callback. Cross-shop and
cross-member state is rejected. Redirects use the canonical shop URL.

Reference: https://developers.line.biz/en/docs/line-login/link-a-bot/

Local checks:

```sh
node scripts/test-shop-line-login.cjs
node scripts/test-line-subscription.cjs
npm run build
```
