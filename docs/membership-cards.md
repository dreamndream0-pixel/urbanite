# Membership Cards

Ten user-supplied card artworks are available in the existing loyalty manager,
under `等級與回饋設定`. They are visual styles, not ten new membership levels.
Existing tier limits, thresholds, retention, reward, redemption and refund rules
remain unchanged. No database migration is needed: presentation settings are
stored alongside the existing shop-scoped LOYALTY JSON configuration.

## Editable Fields

- Each existing tier has a card design and three benefit labels/descriptions/icons.
- Each tier's `卡片顏色` disclosure contains its design picker, SVG/upload controls,
  copy settings and live preview. Only one tier editor is expanded at a time.
  The mapping
  follows the stable tier key, not its display name; a gold-named tier may use
  royal blue, and the highest tier may use any of the ten designs.
- The card title, introductory line, footer subtitle and action label are shared,
  editable shop settings.
  The default heading is `VIP membership`; the old default heading is migrated
  when settings are resolved, without replacing custom headings.
- Labels support `{rate}` and `{threshold}` placeholders from the actual tier.
- Names and thresholds still use the existing tier editor. The member's name
  comes from their existing customer profile, not from the design or preview.
- The card's main heading is the member's name, not a second tier label. English
  shield names (BLACK through CHAMPAGNE) follow the selected artwork independently
  of the editable business tier name. Before overriding a preview member name,
  its default follows the edited tier name immediately; preview overrides never
  rename a real member. Saves and returning to the member page refresh the data.
- The accumulation period input edits the existing shared `keepMonths` setting
  (1-36 months), not a separate cosmetic period. It also controls retention under
  the existing business rules. The card's left panel shows the real available
  credit balance, tier/rate and pending/expiry status, not a spending threshold.
  The right panel still uses actual accumulated spend and the next tier's
  threshold for upgrade progress and shows the configured accumulation period.
- Nine trusted Lucide SVG files can be selected. The glyph regions of the baked
  artwork are covered by independent icon layers; the original circular frames
  and surrounding artwork remain visible.
- Custom icon uploads reuse the authenticated, raster-sanitizing image upload
  endpoint. Arbitrary SVG uploads and inline SVG source are not accepted.
- Preview name/spend/credit are local preview inputs only; they never change customer
  transactions, balances, eligibility or progress. Benefit copy is descriptive;
  writing a new benefit does not create a new automatic checkout entitlement.
- Disable `圖片會員卡` to retain the classic credit view. Disabling loyalty also
  keeps the existing no-rewards behavior.

## Rendering and Assets

The original 1448 x 1086 artwork is converted losslessly to WebP, with separate
320px thumbnails for the style picker. The original ZIP remains the source of
truth. All names, labels, amounts and controls are React HTML elements. Only
the original baked meter area is covered and replaced with a real progressbar;
its fill and accessible text use the existing server-calculated spend/next tier.
The zero-progress and highest-tier cases do not show the decorative static fill.
Backgrounds have stable 4:3 geometry and use Next Image responsive delivery.
Small icon images are standalone SVG/raster files, not copied into the artwork.
All 30 benefit circles have separately measured centers/radii in
`MEMBERSHIP_BENEFIT_CIRCLES`; the ten artworks do not share identical coordinates.
Masks leave the original metallic ring visible. Icon images are absolutely
centered inside fixed-aspect-ratio masks and cannot force a minimum flex size,
so long labels, optional descriptions and uploaded images cannot shift them.
Tests validate circle edges against the actual source pixels and check all 30
positions and all nine SVG choices across mobile, WebKit and desktop widths.
All twenty original benefit dividers are separately measured in
`MEMBERSHIP_BENEFIT_DIVIDERS` and covered with adjacent horizontal texture before
the HTML copy is painted. This removes lines from the text columns without
moving the circle frames, narrowing the copy or editing the source image files.
Browser pixel tests compare the source line with its masked rendering for every
card, in addition to geometry and long-copy checks.
The artwork becomes visible in the same render as its cleanup overlays, so
loading a background cannot briefly expose its original lines through the copy.
The duplicate external VIP heading/benefit list and external credit summary are
removed when an image card is active. Its action still opens the existing tier
and transaction details, including available, pending and expiring balances.
The entire upper rewards band uses a matching backdrop for each of ten designs.
It starts with the membership card, without the old coupons heading, English
subtitle or promotional copy. The former heading gap is removed as well.
The rewards band owns the credit read and derives the theme from the same
response as the card. Initial reads reserve the card's 4:3 dimensions on a
neutral background, never the old classic zero-balance card. Failed initial
reads offer retry without inventing a balance. Background refresh failures keep
the last successful card, while authorization failures clear it. Disabled loyalty
hides the band; classic rewards render only after a successful response selects
that mode. No member balances are stored in local/session storage or a shared cache.
The artwork's outer backdrop fades into that color without changing the physical
card or source pixels. Disabling image cards restores the classic rewards view
and the shop's existing coupon hero image.
Card copy uses the site's existing Noto Serif TC with Chinese serif fallbacks.
Supporting card copy retains the reduced text sizes. The member's name is larger
in the original heading region. Benefits and their icon masks are horizontal flex
rows; optional descriptions form a second line. Footer copy is centered beside
the original crown. Card geometry, icon frames and admin inputs are not scaled.
The action's touch target remains centered on the original pill even when its
44px hit area is taller than the artwork button. Thin presentation overlays reuse
adjacent clean texture from the same loaded image to hide the empty title/slogan
rules; source artwork files are unchanged and no second full-size URL is fetched.
Mobile editor inputs use at least 16px text, preserve untrimmed typing drafts,
and move the save control into normal flow while a field has focus, so it does
not cover the active field above the on-screen keyboard. While membership settings
are mounted, iPhone non-Safari browsers use native document scrolling instead of
the nested body scroller; the original mode and position are restored on exit.
Focus and visual-viewport resizing reveal a field only if it is obscured. Pull to
refresh does not intercept this form. Real iPhone keyboard behavior still needs
physical device verification; tests include iPhone Chrome UA/WebKit, shortened
viewports without manually scrolling fields into view, and scroll-mode cleanup.
On initial display and opening member details, a two-second gold sweep and soft
edge glow play once. The animation does not intercept input, stops after the
reveal, and is disabled with `prefers-reduced-motion`. Admins can replay it in
the preview without changing member data.

If artwork must be regenerated from the attachment:

```sh
node scripts/prepare-membership-assets.cjs <extracted-membership_cards-directory>
node scripts/test-membership-card.cjs <extracted-membership_cards-directory>
```

Passing the source directory verifies that all ten full-size WebP files decode
to the exact original image pixels. Unit/API tests mock all customer data.
Browser tests use `scripts/fixtures/MembershipCardFixture.tsx` through a temporary
local route and intercept all API reads/writes. Do not deploy the fixture route.

```sh
node scripts/test-membership-card.cjs
node scripts/test-membership-card-browser.cjs <playwright-module> <fixture-url>
node scripts/test-member-rewards-loading-browser.cjs <playwright-module> <fixture-url>
node scripts/test-membership-dividers-browser.cjs <playwright-module> <fixture-url>
```
