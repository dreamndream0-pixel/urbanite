# URBANLINKS Hero Assets

## Interactive commerce hero (2026-10-16)

Headline motion: the number 3 scales in with a single restrained bounce and
the remaining first-line letters reveal in sequence. The second line keeps
"打造" fixed and rotates four equal-width phrases every four seconds:
質感網店 / 品牌官網 / 個人名片 / 預約服務. A duplicate first phrase makes the
16-second loop seamless; the 4em by 1.12em viewport never changes dimensions.
Only the transition briefly fades and blurs the text. Hover, an open import
dialog, a hidden browser tab, and leaving the viewport pause the word rotation.
Reduced motion keeps the initial headline static. A fixed accessible heading
name avoids repeated screen-reader announcements. Regression tests seek each
animation phase and check all words, the wraparound, and stable heading geometry.

Only the top hero is replaced. The header, promotion, lower LINK / SHOP /
BRAND scenes, carousels, pricing, and backend settings are unchanged.
`HeroExperience.tsx` and `hero-experience.module.css` isolate the new layout.
Phones, headings, feature tabs, booking slots, social selection, and the
growth-period switch are live HTML. Analytics and bookings are explicitly
demonstrations; no orders, bookings, or social bindings are written.
The original import flow remains available through the one-click move action.
Its preview callback closes the native dialog before the portal preview opens.

Mode: built-in image generation, not the fallback CLI.
Saved background: `public/card/hero-commerce-studio.webp` (1536 x 1024).
The original generated PNG is kept outside the repository in the task's
generated-images directory. Existing phone photography is reused.

Final prompt: Photorealistic natural photography, a full-bleed premium
beauty-business website background plate, landscape 3:2. A cream-white studio
with sheer linen curtains, soft natural window light, and plaster-wall shadows.
A travertine table occupies the bottom 22 percent. Small rough stones and dried
flowers sit at the lower left; a rounded ivory ceramic vase and dry stems sit
at the far right. Keep the central 75 percent and upper 65 percent quiet for
editable HTML. Neutral daylight, no yellow cast. No phones, hands, people,
interfaces, text, logos, borders, orbs, or bokeh.

The shared `onPageScroll` helper supports the current iPhone Chrome body-scroll
path. Motion affects transforms only; it does not change document height.
Reduced motion disables reveal, floating, and scroll-parallax animations.

Verification: production build and ESLint pass. `scripts/test-urbanlinks-hero.mjs`
checks Chromium at 320x740, 390x844, 430x932, 768x1024, 1440x960, and 390x667,
plus WebKit at 390x844. All hero images load, headings and phone contents fit,
and the document has no horizontal overflow. Tests cover feature tabs and
keyboard navigation, booking confirmation/reset, social selection, period
selection, import errors, successful embedded and shared import previews,
Escape/focus restoration, reduced motion, and the scroll-to-services action.
Import API responses are mocked; no real user data is imported or saved.
The iPhone Chrome body-scroll path is emulated, including scrolling after a
dialog closes; physical iPhone testing is still required.

Run with Playwright available locally, or set `PLAYWRIGHT_MODULE` to the bundled
runtime's `playwright/index.mjs`. `HERO_URL` defaults to localhost:3013/card.
Set `TEST_WEBKIT=1` to include the installed WebKit engine. Screenshots are
written to the ignored `outputs/urbanlinks-hero/` directory.

## Earlier hero assets (historical)

The hero uses editable HTML for its logo placement, copy, phone screens, menu,
and glass URL bubble. None of the demonstration phone content links to a store.
The arrow in the URL bubble uses the existing page creation flow.

## Image Generation

Mode: built-in image generation, not the fallback CLI.

The supplied hero reference guided the lighting, materials, and composition.
The prompts below record the final asset specifications. All selected images
were copied into the project and optimized as WebP.

### Desktop Background

Saved as `public/card/hero-studio.webp`.

Prompt specification: Create a full-bleed 4:3 website hero background plate
based on the reference. Preserve ivory curtains with soft vertical folds,
warm off-white plaster on the left, pale travertine stone along the bottom,
a small beige rounded clay character with eyes at the lower right, and one
realistic graceful hand entering from the lower right. Remove all phones,
interfaces, words, logos, buttons, icons, squiggles, and black letterboxing.
Keep the left 46 percent quiet for HTML text and the center/right empty for
HTML phones. Keep the hand in the lower-right quarter and stone in the bottom
14 percent. Use neutral ivory, soft daylight, and no yellow cast.

### Mobile Background

Saved as `public/card/hero-studio-mobile.webp`.

Prompt specification: Recompose the desktop plate as a vertical 9:16 mobile
background, not a crop. Retain the ivory curtains, cream wall, travertine,
hand, and small clay character. Keep the left half bright and empty, curtains
on the right, and stone in the bottom 17 percent. Make the hand smaller,
positioned between 60 and 100 percent horizontally and 55 and 90 percent
vertically; keep fingertips right of 55 percent. Put the small character at
the far right behind the hand. Keep the top third empty. No phones, text,
logos, or interfaces.

### Demonstration Fashion Photography

Saved as `public/card/demo-fashion.webp`.

Prompt specification: Vertical 3:4 editorial photograph of a fictional adult
East Asian lifestyle creator with shoulder-length dark hair, a light taupe
cardigan with shell buttons, and an ivory linen skirt. She holds a small cream
bouquet and looks left. Show shoulders and torso in a boutique with ivory
curtains, desaturated neutral colors, and soft daylight. No text, phones,
graphics, or logos.

The existing `demo-creator.webp` and `demo-collection.webp` demonstration
assets are reused in the phone galleries.

## Verification

- Responsive browser checks: 320, 390, 430, 768, and 1440 pixel widths.
- No horizontal overflow or unloaded images in the tested mobile layouts.
- Scroll reveal, phone screen movement, navigation menu, and creation link checked.
- Reduced motion removes the sticky scroll sequence and shows a static scene.
- Physical iOS/Android devices and Safari have not been tested.

## Product Showcase And Template Collection

The lower LINK / SHOP / BRAND scenes use independent phone and photograph
layers. Their vertical offset, tilt, and screen position follow page scrolling.
The section order is LINK, the full-width LINK carousel, SHOP, the full-width
SHOP carousel, then BRAND.
Reduced motion keeps the phone layers still. The original hero behavior is
unchanged; both sections share `DemoPhoneContent.tsx` for the profile and shop
screen artwork.

The nine supplied examples (photos 2 through 10) are copied unchanged to
`public/card/templates/`, in this order:

1. `casa-mellow.jpg`
2. `petal-nail.jpg`
3. `aurea-beauty.jpg`
4. `lunea-clinic.jpg`
5. `mellow-cast.jpg`
6. `velocraft.jpg`
7. `sora-bean.jpg`
8. `mona-atelier.jpg`
9. `ciel-table.jpg`

Photo 11 is not included because the requested range was photos 2 through 10.
These are illustrative designs, not links to live businesses.

The following LINK examples were subsequently replaced with supplied images,
keeping their original positions and leaving SHOP unchanged:

- PETAL NAIL -> PETAL NAILS (`petal-nails.jpg`)
- AUREA BEAUTY -> LUMEA SKIN (`lumea-skin.jpg`)
- VELOCRAFT -> VELOMOSS (`velomoss.jpg`)
- SORA BEAN -> MORNING BEAN (`morning-bean.jpg`)

The medical clinic example remains separate from the skincare brand example.
New filenames avoid reusing cached versions of the previous images.

The eight unique supplied SHOP examples are copied unchanged to
`public/card/templates/shop/`, in this order:

1. `lunora-studio.jpg`
2. `veloa-trail.jpg`
3. `paw-co.jpg`
4. `papermint.jpg`
5. `bon-sucre.jpg`
6. `nova-case.jpg`
7. `ember-roast.jpg`
8. `vera-glow.jpg`

The supplemental batch contained two byte-identical repeats (VELOA TRAIL and
LUNORA STUDIO), which are not duplicated in the carousel. Two additional unique
designs are still needed to reach ten. Collection metadata is
in `template-collections.ts`; both rows share `TemplateCarousel.tsx` with
independent controls, dialog state, and accessible element IDs.

The single-row carousel uses Embla 8.6.0 and its Auto Scroll plugin. It pauses
when off screen, when the tab is hidden, during dragging, while hovered or
keyboard-focused, and while a native image-preview dialog is open. Explicit
pause and arrow navigation disable automatic movement until Play is selected.
Reduced motion disables automatic scrolling but retains manual navigation.

Reference: [Embla v8 Auto Scroll](https://www.embla-carousel.com/docs/v8/plugins/auto-scroll).

Verified in the local browser at 320, 390, 430, 768, and 1440 pixel widths:
all nine images load, the single row advances and loops, Pause holds its
position, drag moves the row without opening a preview, arrow navigation works,
Escape closes the preview and returns focus, and reduced motion stops automatic
movement while retaining keyboard navigation. Lint and production build pass.
These browser checks do not replace physical iOS or Android device testing.

The added SHOP collection was checked at 320, 390, and 1440 pixel widths.
All six images load, placement follows SHOP, navigation does not change LINK
controls, and its preview opens the correct SHOP image. Escape restores focus.
No duplicate IDs or horizontal page overflow were found. Reduced motion hides
automatic playback controls for both collections. Lint and production build pass.

## Public pricing page (2026-10-08)

`pricing-studio.webp` and `pricing-studio-wide.webp` are AI-generated studio
photographs created for this page, with separate mobile and panoramic crops.
Headlines, prices, feature lists, and actions are live HTML rather than image text.
Prices and features use `lib/card-plan.ts`; campaigns read the existing backend
settings through `getCardPromo`. No production campaign settings were changed.
Run `node scripts/test-card-promo.cjs` for scheduled, active, disabled, and expired
campaign boundary checks. These checks do not submit payments.
