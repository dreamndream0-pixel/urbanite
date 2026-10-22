# Shared Business Identity Rollout

## Deployment Order

The menu-only commit can ship independently. Do not deploy the registration and
shared identity changes until `supabase/migration-business-identity.sql` has been
applied to the production Supabase project. The migration is additive and does
not rewrite existing accounts, shop URLs, permissions, or plans.

New onboarding opts a card into shared business identity. A directly owned,
unambiguous existing shop is suggested and its URL retained. Staff memberships
do not establish ownership. Multiple owned shops are never renamed together.
Creating a shopping website still requires the existing U Pro eligibility check.

Database triggers reserve confirmed URLs across cards and shops and synchronize
the linked shop, card and booking business in the same transaction. Changing a
shared URL also changes the linked shop subdomain; custom domains are untouched.
Historical booking/order snapshots and legal footer company names are untouched.

## Verification

Run `node scripts/test-business-identity.cjs` for mocked API tests. For isolated
PostgreSQL trigger tests, install `@electric-sql/pglite` in a temporary directory
and set `PGLITE_MODULE` to that package's absolute path, then run
`node scripts/test-business-identity-sql.cjs`.

For browser tests, temporarily expose `scripts/fixtures/BusinessIdentityFixture.tsx`
at `/business-identity-test`. Pass its `app` prop from the page's `searchParams`
to avoid hydration mismatches. Run `node scripts/test-business-identity-browser.cjs`
against a development server at port 3015, or set `TEST_ORIGIN`. Remove the fixture
route before building or deploying. All test writes are mocked or local.

The menu was deployed separately in commit `5994171`. The shared identity
migration was applied successfully to production through Supabase SQL Editor on
2026-10-22 before deploying the registration changes. No existing account was
opted in automatically and no production business records were changed for tests.
