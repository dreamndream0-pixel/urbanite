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

The authenticated start route issues signed, shop/member-bound state valid for ten
minutes. PKCE S256 binds the code to that exact request; the verifier is derived
server-side using a separate HMAC purpose and is never sent to the browser.
The callback can finish without browser cookies when LINE opens a different
webview. It verifies the signed initiating member against Auth, rejects a different
active member or a newer binding, and never creates a login session. Older pre-PKCE
state is rejected. OAuth codes are single-use. Cross-shop state is rejected.
Redirects use the canonical shop URL and a public result page rather than the
login-protected account page. Refresh the original account page to see the binding.

Reference: https://developers.line.biz/en/docs/line-login/link-a-bot/
PKCE: https://developers.line.biz/en/docs/line-login/integrate-pkce/

Local checks:

```sh
node scripts/test-shop-line-login.cjs
node scripts/test-line-subscription.cjs
npm run build
```
