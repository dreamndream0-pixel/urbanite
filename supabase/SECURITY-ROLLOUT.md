# Security rollout order

The application patch alone is not the database migration. Run SQL as the project
database owner, not with the public/anonymous key. Do not paste credentials in chat.

1. Review the read-only output of `security-audit.sql`. In particular inspect
   sensitive-table grants, permissive policies and SECURITY DEFINER functions.
2. Apply `migration-security-settlement.sql` before deploying the RPC-only payment
   adapter. Its changes are transactional and additive. Confirm the service-role
   RPC `card_settlement_version` returns 1.
3. Review/apply `migration-security-isolation.sql`. It revokes direct browser
   access to the named sensitive tables, adds restrictive deny policies, and
   forbids moving existing records between shops. Server service-role API access
   is retained. External integrations that directly use anon/authenticated table
   access must be reviewed before applying this policy change.
4. Run `node --env-file=.env.local scripts/prepare-private-proofs.mjs --apply` for
   the intended backend, then `scripts/verify-private-proofs.mjs` with the same
   environment. The verifier creates and deletes only its own synthetic PNG.
5. Deploy and verify owner/admin proof viewing and unrelated-user/other-shop
   denial. Run a real sandbox payment round-trip and simultaneous callback test.

## Current execution status

- The backend configured by `.env.local` now has a private `payment-proofs` bucket.
  Anonymous authenticated-download and public-URL paths rejected a synthetic PNG.
  The test object was removed. No customer image was downloaded or changed.
- Read-only query found zero legacy public proof references on this backend.
  This is not a scan of orphaned storage objects or other deployments. If another
  backend has existing public proofs, copy/verify each object, update its order
  reference and remove the public original after the new reader is deployed.
- Settlement readiness RPC is currently absent/unavailable. SQL migrations have
  NOT been applied; there is no database-owner connection in this workspace.
- Until settlement SQL is applied, new card-plan payments return 503 before a
  payment record/form is created. Existing successful callbacks remain pending
  and need retry/reconciliation after migration. Do not tell customers to pay
  twice. Ordinary storefront checkout is unchanged by this readiness gate.

## Guarantees and limits

- The subscription function locks its payment row, serializes per-user payment
  settlement and commits subscription/paid status together. Replays are no-ops;
  amount and transaction mismatches are rejected. Execute permission is limited
  to service_role. Existing paid rows are NOT retroactively repaired; reconcile
  historical paid-but-not-entitled records manually against gateway evidence.
- Referral reward grants and manual admin entitlement updates still use their
  existing write paths. Concurrent interactions with those paths require further
  transactional work. Storefront order/payment/history settlement also remains
  outside this subscription-only migration.
- The proof reader uses the current shop's scoped order query and requires its
  owner or an authorized shop/platform admin. It streams bytes with no-store,
  rather than exposing a public or signed URL. New uploads are private only.
- Scoped updates force the current shop ID. DB triggers additionally prevent
  reassignment through upsert when the isolation migration is applied. This does
  not replace a full audit of every cross-table foreign-key relationship.
- Coupon claims now ignore duplicate inserts instead of resetting spent/revoked
  state. Admin grants require a coupon in the current shop. Favorites require a
  product in the current shop and do not overwrite an existing conflict row.
  Concurrent coupon inventory limits still require a separate DB transaction.

## Tests

Run the access-control, order-access, security-hardening and private-payments CJS
scripts in `scripts/`. `test-security-sql.mjs` accepts the absolute path to an
installed `@electric-sql/pglite/dist/index.js`. The local test used PGlite 0.5.8
outside the repository, with a fresh in-memory database and synthetic fixtures.
It checks SQL compilation, permissions, restrictive policies, idempotency,
renewal and rollback. It cannot prove independent-connection concurrency,
production schema compatibility or actual deployment of the migration.
