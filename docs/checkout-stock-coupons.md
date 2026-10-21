# Checkout Stock and Coupon Updates

## Quantity Limits

- Product detail, quick add, cart drawer and checkout use `lib/cart-stock.ts`.
- A variant must match exactly once. Missing products, unavailable products and unknown/ambiguous variants cannot be increased.
- Unspecified products share one stock bucket even when old cart lines have different labels.
- Product/quick-add limits subtract quantities already in the cart. Switching variants immediately caps the displayed selection.
- Preorders follow the existing order API's inventory limits; the frontend no longer offers an unlimited quantity that the API would reject.
- Opening cart/quick add refreshes the uncached cart catalog, including active campaign products. Returning to checkout/detail refreshes stock; checkout also refreshes cross-tab cart changes.
- Previously saved quantities above current stock remain visible with an immediate warning and removal control. The checkout button stays disabled until corrected; no items are silently deleted.
- The order API remains the final validator. Frontend checks do not reserve stock or eliminate changes caused by another buyer checking out concurrently.

## Coupon Lifecycle

- A selected code/member coupon is separate from its validated discount amount.
- Validation is tied to the exact item IDs, variants, quantities, current prices, subtotal and shipping. A changed cart cannot reuse the old amount while waiting for validation.
- Still-eligible percentage/free-shipping discounts are recalculated automatically.
- An invalid coupon is removed from both selection and input. A notice states that the order no longer meets the threshold or usage conditions and asks the customer to choose again.
- Temporary validation failures remove the unconfirmed discount with a distinct retry notice, not a misleading eligibility message.
- A member coupon displays its selected/checking state and checkmark directly on that coupon. Clicking it applies it; clicking the same coupon again cancels, including during validation. There is no duplicate selected-coupon panel for member coupons.
- A manually entered code has a selectable applied-coupon row; clicking that row cancels it.
- Obsolete responses cannot restore a removed coupon, replace a newer selection or display an old rejection.
- Order submission is disabled while coupon validation is pending. Server-side validation and coupon consumption are unchanged.

## Verification

```powershell
node scripts/test-cart-stock.cjs
node scripts/test-product-selection.cjs
node scripts/test-checkout-stock-browser.cjs <playwright-module-path> http://localhost:<port>/checkout-stock-test
npm run build
```

For browser tests only, temporarily mount `scripts/fixtures/CheckoutStockFixture.tsx` from a local route. Remove that route before the final production build. The tests intercept all browser API traffic and never create real orders or payments.

Coverage includes 320/390 px Chromium, iPhone-sized WebKit, desktop, stock caps, shared stock, low-stock variants, existing cart deductions, stale quantities, missing items, member/manual coupon removal, changed category/product eligibility at the same subtotal, shipping/percentage recalculation, unavailable validation and delayed-response races.

## Shared Spec Picker

- Product detail and the homepage/campaign quick-add dialog render `ProductSpecPicker` and use `lib/product-selection.ts`.
- Both honor the same option order, text/photo display settings and option images. The selected option updates the image, variant price and stock-limited quantity.
- If a color/size is available only in another combination, choosing it keeps other choices where possible and moves to an available combination rather than trapping the buyer between disabled options.
- Changed backend spec definitions are resolved against current options, not an old cached selection. Sold-out choices remain unavailable; no-spec products keep the existing simple flow.
- Browser tests compare both rendered pickers and verify image assets, schema refreshes and exact variant/price/quantity written to the cart.
