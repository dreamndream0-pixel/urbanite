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
- The remove icon remains available during validation. Clicking the selected member coupon also removes it.
- Obsolete responses cannot restore a removed coupon, replace a newer selection or display an old rejection.
- Order submission is disabled while coupon validation is pending. Server-side validation and coupon consumption are unchanged.

## Verification

```powershell
node scripts/test-cart-stock.cjs
node scripts/test-checkout-stock-browser.cjs <playwright-module-path> http://localhost:<port>/checkout-stock-test
npm run build
```

For browser tests only, temporarily mount `scripts/fixtures/CheckoutStockFixture.tsx` from a local route. Remove that route before the final production build. The tests intercept all browser API traffic and never create real orders or payments.

Coverage includes 320/390 px Chromium, iPhone-sized WebKit, desktop, stock caps, shared stock, low-stock variants, existing cart deductions, stale quantities, missing items, member/manual coupon removal, changed category/product eligibility at the same subtotal, shipping/percentage recalculation, unavailable validation and delayed-response races.
