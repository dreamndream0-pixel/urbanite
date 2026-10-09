# Access-control review: 2026-10-09

## Fixed in this batch

- `getAdminUser` denies empty allowlists, invalid sessions, and authorization
  dependency failures. Successful authorization requires an explicit email match.
- Administrator allowlists are read independently of the general integration
  cache. Database/decryption failures are not silently treated as empty settings.
  Environment and database entries remain combined; a missing database row is
  valid, but an unavailable database is not. No administrator identities changed.
- Profile-card block PATCH/DELETE retain the ownership check and additionally
  constrain the actual mutation by both block ID and the authenticated card ID.

## Verification

Run `node scripts/test-access-control.cjs` (38 checks passed). Tests execute transpiled production
functions with mocked authentication/database dependencies, without writes to a
live database. They cover allowlist failure, normalization and decryption,
protected handler rejection, cross-card mutations, and another member's order
history. They are not a penetration test or an exhaustive API audit.

Code inspection found shared administrator gates on the admin APIs and privileged
order/product/stock/campaign operations. Integration settings additionally require
the panel unlock token. Member order cancellation/history/payment-proof/returns
check order ownership; favorites/coupons/customer writes use authenticated user
IDs; card statistics and block operations resolve the authenticated card.

Read-only preflight against the locally configured backend confirmed the
integration settings table is readable and one environment-sourced administrator
entry exists. No stored administrator override was present. No emails, keys,
customer records or payment data are included in this report.

Targeted ESLint passed. Two production build attempts were blocked by external
Google Fonts download failures in the existing homepage font dependency, so a
successful production build/deployment is not confirmed by this review.

## Deployment checks still required

- Verify production Vercel has the intended `ADMIN_EMAILS` and working Supabase
  configuration before relying on admin access. Database outages now deny admin
  access intentionally. Do not restore the empty-list bypass as a workaround.
- Confirm a real administrator can sign in and a regular member cannot access
  admin data in the deployed application. Mock tests do not prove production
  identity-provider or environment configuration.
- Inspect actual Supabase RLS policies, grants and storage policies. Migration
  files alone do not establish what is applied in production.

## Order access follow-up: 2026-10-09

- `/api/orders/status` and `/api/payment/newebpay/checkout` now require either
  the matching authenticated member or, for guest orders only, a valid per-order
  HMAC credential. A guest cookie never overrides member ownership.
- Guest order creation sets a seven-day HttpOnly, SameSite=Lax cookie, Secure in
  production. Credentials are never put in URLs or returned to frontend JS.
  Signing uses `ORDER_ACCESS_SECRET` when set, otherwise the existing server-only
  Supabase service-role key. Rotating that key invalidates outstanding cookies.
- The status response explicitly selects public-facing result fields and omits
  owner IDs. Both protected endpoints disable response caching.
- Checkout completion now displays an access/lookup failure instead of claiming
  the order succeeded when it could not retrieve the result.
- `node scripts/test-order-access.cjs`: 32 checks passed with mocked auth, database
  and gateway calls. Targeted ESLint and TypeScript passed. No real payment was
  initiated and no live order was created.
- The follow-up production build succeeded, including TypeScript and static page
  generation; the earlier font download issue did not recur. All 70 checks across
  both security test scripts passed. This does not confirm Vercel deployment.

Operational caveats: older guest orders have no credential and need customer
support, not an order-number fallback. Clearing cookies, changing browsers or
hosts, expiration, or secret rotation also requires support. Keep checkout and
gateway return URLs on the same canonical host. SameSite=Lax cookies are sent on
the top-level GET after the gateway return handler's 303 redirect; gateway POST
handling itself does not need the guest cookie. A real sandbox gateway round-trip
and deployed member login still need verification.

## Known follow-up risks (not fixed here)

- Distributed request throttling, bot checks, cross-site request protection,
  imported URL/upload validation, admin MFA, infrastructure firewall rules,
  backups and alerting still need dedicated review and verification.

This batch does not establish parity with a third-party security program and
does not change production database policies, payment configuration or firewall
settings.
