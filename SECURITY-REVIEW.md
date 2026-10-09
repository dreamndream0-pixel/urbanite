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

## Known follow-up risks (not fixed here)

- `/api/orders/status` and `/api/payment/newebpay/checkout` currently accept an
  order number without a member ownership or guest-access proof. Add scoped guest
  authorization together with checkout creation, gateway redirects and retries;
  simply requiring login would break the existing guest checkout flow.
- Distributed request throttling, bot checks, cross-site request protection,
  imported URL/upload validation, admin MFA, infrastructure firewall rules,
  backups and alerting still need dedicated review and verification.

This batch does not establish parity with a third-party security program and
does not change production database policies, payment configuration or firewall
settings.
