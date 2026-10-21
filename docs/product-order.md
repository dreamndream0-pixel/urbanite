# Product Order

New products default to the front of their shop's main catalog or their selected
campaign, using the current group's smallest `sort_order` minus one. No existing
rows are rewritten. Imports use the same policy; duplicate imports keep position.
The UI prepends successful creations and selects their existing stock-status tab.

New drafts send `insert_at_start: true` so a stale open form uses the current
server-side head. Editing the numeric position opts out. Manual editing and
campaign drag ordering remain authoritative. Equal ranks use newest creation
time first in both database reads and the UI, including concurrent head inserts.
Read failures abort insertion instead of silently using an arbitrary rank.
The helper receives the existing shop-scoped database client; campaign groups
are filtered independently. No database migration or inventory change is needed.

Tests mock all database/API writes:

```sh
node scripts/test-product-order.cjs
node scripts/test-product-import.cjs
node scripts/test-product-order-browser.cjs <playwright-module> <temporary-fixture-url>
```

The browser fixture uses `scripts/fixtures/ProductOrderFixture.tsx`. Do not deploy
the temporary route.
