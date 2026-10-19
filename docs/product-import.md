# Product Migration

The product manager includes single-product and whole-store migration. It accepts
public HTTP/HTTPS URLs without a platform allowlist. It does not bypass login,
CAPTCHA, anti-bot protection, or private APIs, and it cannot guarantee extraction
from every website or JavaScript-only catalog.

## Extraction

- Read generic JSON-LD Product/ProductGroup data, referenced offers, Open Graph,
  microdata, and public product fields.
- Detect Shopify public product JSON and convert minor-unit prices; detect public
  WooCommerce variation matrices. Never evaluate JavaScript from a source page.
- Preserve explicit variant combinations and individual prices. Do not invent
  stock from an `InStock` flag. Missing stock, currency, or prices require input.
- Scan same-origin catalog links, pagination, robots sitemap declarations, and
  sitemap indexes. Large sitemap responses use 200-entry continuation offsets.
- Store queue progress and editable results in IndexedDB, scoped to the current
  hostname. Save changed products independently to avoid repeatedly rewriting
  every description in a large catalog. Resuming requires user action.

## Publication

`POST /api/products/import` accepts `discover`, `read`, and `apply` actions.
All actions require authorization for the current shop, bounded request bodies,
and account-level rate checks. Every remote fetch uses the DNS-pinned public
fetcher, including redirects and images.

The user confirms content rights, currency, destination category, stock, and
publication status. Incomplete recognition requires an additional review check.
The default is unpublished. Published products must have positive inventory.

Descriptions are restricted to inert HTML. Gallery, description, and variant
images are downloaded, decoded, resized, stripped of metadata, and stored as
WebP in the current shop's import namespace before any product row is inserted.
Limits are 10 gallery images, 20 description images, 30 distinct migrated images,
five option dimensions, and 200 variant combinations per product. Truncation is
reported and requires review; unsupported products are not silently published.

Product IDs hash the destination shop and canonical source URL. Repeated or
concurrent imports do not overwrite existing products. Failed staging or insert
operations remove only files owned by that attempt. Initial inventory is logged;
a journal failure is explicitly reported after a successful product insert.

No new database migration, AI key, or external crawling service is required.

## Shopee Source Limitations

Shopee Taiwan short links can redirect correctly while returning only a dynamic
app shell without product data. The browser can also redirect to a traffic
verification or login page. These responses are explicitly rejected for both
single-product and whole-shop reads, rather than importing a login heading or
reporting an empty successful scan. A public page with usable product data is
still accepted. Product IDs in Taiwan share links are normalized across long
URLs and randomized tracking parameters to avoid duplicate imports.

Changing a short URL to a long URL does not solve missing source data. This
implementation does not bypass verification, borrow browser cookies, or call
private marketplace APIs. Seller export files and an officially authorized
marketplace integration are possible future import sources, not supported
workflows in this version.

## Verification

```sh
node scripts/test-product-import.cjs
```

Browser tests mount `scripts/fixtures/ProductImportFixture.tsx` through a temporary
local route and intercept every API operation. Do not deploy that test route.

```sh
node scripts/test-product-import-browser.cjs <playwright-module> <fixture-url>
```
