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

## Application hardening follow-up

Implemented in this batch:

- Payment browser returns now require a valid TradeSha before decrypting or
  settling. Both order and subscription settlement reject absent, malformed,
  fractional, non-positive and mismatched amounts, including already-paid card
  payments. Successful provider notices with failed settlement return 503 instead
  of falsely acknowledging success. Subscription claim database errors are no
  longer silently acknowledged.
- Logistics decoding requires HashData rather than accepting unsigned encrypted
  payloads. A real logistics sandbox callback must still verify compatibility.
- API write requests require same-origin evidence and reject cross-site writes.
  Exact POST callback endpoints are excluded because their handlers authenticate
  provider messages. A declared body larger than 8 MiB is rejected by proxy.
  This header check is not a universal streaming body-size limit.
- Public imports, link previews, social HTML and avatar downloads use a shared
  bounded downloader. Each redirect is revalidated; the connection uses the
  validated DNS address, retaining HTTPS hostname/certificate validation.
  Private/reserved IPv4, credentials, nonstandard ports and IPv6 are rejected.
  IPv6-only sites and servers ignoring identity encoding are not supported.
  Responses are bounded to 1-6 MB with a 15-second per-download deadline.
- Profile/product/proof/logo uploads now decode and re-encode image content,
  verify the actual format, limit pixels/frames and remove metadata. Multipart
  readers enforce a streamed 6 MiB bound on these routes. New SVG logo uploads
  are rejected; existing assets are not changed or retrospectively scanned.
- Account-based per-instance limits cover integration unlock, member image
  upload, social fetch and link preview. These reset on cold starts and are not
  distributed throttling, guest checkout protection or DDoS protection.
- Added nosniff, referrer policy, HSTS, same-origin framing and a minimal CSP
  (object-src/base-uri/frame-ancestors). This is not a strict script-src CSP or
  proof that all stored/reflected XSS paths have been audited. Third-party iframe
  embedding is now disallowed.
- Missing CRON_SECRET disables expiry processing (503). Only Bearer authorization
  is accepted; the previous URL query-key path has been removed.
- Removed fixed panel password 000000. Panel password reads fail closed on DB
  failure/corruption. When no stored password exists, configure a server-only
  INTEGRATIONS_PANEL_PASSWORD of 12-256 characters, then change it in the panel.
  Existing stored passwords are preserved; new passwords require 12-256 chars.
- Updated Next.js/eslint-config-next to 16.4.0 and sharp to 0.35.5, plus compatible
  lockfile security fixes. `npm audit --omit=dev` reports zero known vulnerabilities.
  Full audit still reports five high-severity development-tool entries in the
  braces/micromatch/fast-glob/Next ESLint chain. The suggested forced downgrade to
  Next ESLint 14 was not applied because it is incompatible with the Next 16 setup.

Validation: existing 38 access-control and 32 order-access checks, plus the new
`scripts/test-security-hardening.cjs` negative-case tests. These use mocked
databases/transports and real image decoding; no live payment, customer mutation
or production attack probes. Production build succeeded during this batch.

### Still requires service access and follow-up work

This is not completion of every security upgrade or certification of parity with
ShopStore Defender. The following remain open:

1. Verify Vercel production deployment, configure CRON_SECRET and (if needed)
   INTEGRATIONS_PANEL_PASSWORD before using those protected operations.
2. Enable and verify distributed firewall/rate/bot rules for public order/import/
   tracking routes. No hosting firewall changes were made in this session.
3. Require admin MFA only after enrollment/recovery flows are implemented and
   verified; inspect actual production RLS/storage grants, backups and alerts.
4. Make subscription payment claim and entitlement update one atomic database
   transaction. The existing two-write flow can mark paid before entitlement
   update fails; retrying a paid record does not currently repair that condition.
   Order settlement/history writes also need transaction/idempotency review.
5. Verify sandbox payment and logistics round-trips, private storage/access for
   payment proof images (currently existing public assets bucket), and broader
   endpoint authorization, upload and stored-content review.

No database schema/policy changes, MFA enrollment, secret rotation or firewall
configuration were applied. Never restore unsigned callbacks, default passwords
or unauthenticated cron execution to work around deployment configuration errors.
