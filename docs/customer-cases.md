# Customer cases and navigation

## Placement

- Every URBANLINKS `CardMenu` opens a native modal drawer from the right.
- The drawer is 66.666667vw wide and 100dvh high, with its own scrolling area.
- Desktop uses navigation and selected-work columns; mobile stacks these areas.
- Existing sign-in, sign-out, profile, shop and admin access remain conditional.
- `app/card/page.tsx` places three real-site previews after the product showcase.
- `/card/cases` provides category filtering and keyboard-accessible image previews.
- The homepage's fixed LINE support action uses `CONTACT_LINE_URL`, not a store's
  checkout/customer LINE address. The current specialist URL is
  <https://lin.ee/TcCrcXY>. It does not automatically send a message.
- On mobile, the duplicate free-start link in the hero footer is hidden so the
  fixed support action does not cover it. Header and primary start links remain.
- `/card/cases` is reserved against new profile-card slugs.

## Real-site assets

Screenshots are taken from the supplied public websites, without logging in,
changing their content, placing orders, or generating substitute site imagery.
The script `scripts/capture-customer-cases.mjs` records source URLs and timestamps
under the ignored `outputs/customer-cases/` directory. WebP conversion preserves
the screenshots rather than restyling them.

| Asset | Source |
| --- | --- |
| `public/card/cases/urbanite-live.webp` | <https://www.urbanite.com.tw/> |
| `public/card/cases/chue.webp` | <https://chue.urbanite.com.tw/promo/second-hand> |
| `public/card/cases/snail-rental.webp` | <https://xiaowo-rental.vercel.app/> |

The property-management entry is explicitly pending. Its current image is the
public rental homepage and is labelled as such, not a management-dashboard
screenshot. The user will supply approved backend screenshots; do not generate
a fictitious property-management backend or capture private tenant data.
Replace this entry's image and pending status only after those images arrive.

## Generated examples

The industry selection references the category list at
[Folio's shop directory](https://folio.tw/shop): nail, lash, hair, facial care,
and massage businesses. No real Folio business identities, photographs, or
customer claims are copied. MORI NAIL, DAY HAIR, and SLOW SKIN are fictional
demonstrations, and the LINE AI screenshot is a workflow mockup, not evidence of
a live integration or actual customer messages. Cards and previews label them
as demonstration designs and do not link to fabricated live businesses.

Mode: built-in image generation, not the fallback CLI. Original generated PNGs
are kept under the task's `$CODEX_HOME/generated_images` directory. The selected
images are resized to 1440px wide and saved as WebP in the repository.

### MORI NAIL

Saved: `public/card/cases/mori-nail-demo.webp`.

Final prompt: Create a straightforward, believable screenshot-style homepage
design for a fictional small Taiwanese nail and lash studio, brand text exactly
"MORI NAIL". Landscape 3:2 image. Flat front-on website screenshot, no device
mockup or outer framing. White background, charcoal text, restrained muted sage
accents. A narrow simple header with small wordmark and three short menu labels.
Main central photo shows a real modest clean nail salon: two manicure desks,
practical stools, bottles neatly organized, daylight, a little plant, not
luxury. Below photo show three small realistic manicure photos and short neat
text blocks. Main headline exactly "NAIL & LASH STUDIO" and one small button
"BOOK NOW". Keep typography modest and useful, like a real local business.
Photorealistic natural salon photography. No huge decorative typography, no
gradients, no gold, no excessive flower decorations, no fake success statistics,
no Folio branding, no existing real business names, no browser chrome, no skewed
perspective.

### DAY HAIR

Saved: `public/card/cases/day-hair-demo.webp`.

Final prompt: Create a simple believable website homepage screenshot for a
fictional small independent Taiwanese hair salon, wordmark exactly "DAY HAIR".
Landscape 3:2 image, flat front-on website screenshot with no device frame.
White page, near-black text and very light cool-gray separators, small muted
terracotta accent only for a booking button. Modest top navigation. Hero photo
clearly shows an ordinary attractive small hair salon with three styling chairs,
mirrors, hair tools and soft daylight, slightly lived-in, clean realistic not
luxurious. Short headline exactly "GOOD HAIR, EVERY DAY" with small "BOOK A
VISIT" button. Below hero show three understated service blocks labelled "CUT",
"COLOR", "CARE", one small realistic haircut photo. Practical compact typography,
ample but not excessive white space, no giant cards. No gradients, no gold, no
elaborate ornaments, no invented achievement metrics, no real existing business,
no Folio brand, no decorative device mockups.

### SLOW SKIN

Saved: `public/card/cases/slow-skin-demo.webp`.

Final prompt: Create a quiet realistic website homepage screenshot for a
fictional local facial skincare and massage studio, wordmark exactly "SLOW SKIN".
Landscape 3:2, flat front-on complete website screenshot with no device framing.
Restrained white and pale warm-gray page with muted dusty-rose button, charcoal
small practical type. Narrow wordmark/header with simple text links. Main
photograph: a believable small Taiwanese facial-care room, one treatment bed
with clean white linen, a basic skincare trolley, a modest shelving unit and a
small window plant. Natural daylight, clean ordinary working studio, no
spa-resort grandeur. Main headline exactly "A LITTLE TIME FOR YOURSELF". One
small button "RESERVE". Lower page shows three simple service rows "FACIAL CARE",
"BODY RELAX", "CONSULTATION" with tiny understated thumbnails. No gradients,
gold, excessive decor, oversized headings, real business names, Folio branding,
or fabricated performance claims.

### LINE AI

Saved: `public/card/cases/line-ai-demo.webp`.

Final prompt: Create a restrained realistic product demonstration image for a
LINE AI customer-service integration system. Landscape 3:2 flat front-on
software screenshot, no device frame, no perspective. Practical white desktop
dashboard, pale gray rules, small readable charcoal text, LINE green used only
as accent. Left slim sidebar titled "URBANLINKS" with labels "Inbox", "Bookings",
"Orders". Main content is a simple customer conversation titled "AI Assistant".
Customer bubble exactly "Can I book a facial on Friday?". Assistant bubble
exactly "Of course. Choose a time below.". Three small time choices "10:00",
"11:00", "14:00". A compact right panel titled "Booking" with "Facial care",
"60 min", "11:00" and status "Demo". Small second conversation preview below
titled "Order status" with "Your order is ready.". Show one modest green LINE
wordmark badge without implying official endorsement. No invented real customer
data, phone numbers, personal names, fake statistics, futuristic robots, glowing
effects, gradients, or extravagant cards. The result should look like ordinary
usable customer service software, not a marketing poster.

### LINE AI Order Support

The second LINE AI example is saved as
`public/card/cases/line-ai-orders-demo.webp`, using built-in image generation.

Final prompt: Create a simple realistic software demonstration screenshot of a
LINE AI order-support inbox for a small fashion shop. Landscape 3:2, flat
front-on screenshot, no device mockups. White background, practical small
charcoal type, light gray separators, LINE green accents only. Modest header
"URBANLINKS" and page title exactly "訂單客服" with a small visible "DEMO" label.
Left slim conversation list with generic labels "商品詢問", "訂單進度", "轉接專員"
and no customer names or photos. Main chat uses clear Traditional Chinese:
customer "請問我的訂單寄出了嗎？"; assistant "可以，請提供訂單編號。"; customer
"DEMO-001"; assistant "這是一筆示範訂單，目前狀態為已出貨。". Below show two ordinary
outline action buttons "查詢物流" and "轉接客服". Compact right panel titled
"訂單摘要" with "DEMO-001", "棉質上衣", "已出貨" and "示範資料". Neutral empty avatar
circles, no real personal information, no phone numbers, no fake customer
statistics, no flashy graphics, robots, glowing effects, gradients or decorative
cards. Looks like a normal usable business inbox, not an advertisement. LINE
logo may appear small without claiming official partnership.

## Verification

Use `scripts/test-card-cases.mjs` with Playwright available locally, or point
`PLAYWRIGHT_MODULE` to the bundled `playwright/index.mjs`. `CARD_TEST_ORIGIN`
defaults to localhost:3013. `TEST_WEBKIT=1` also runs the installed WebKit engine.
Tests cover 320/390/768/1440 widths, right-to-left drawer geometry, focus cycling,
Escape/backdrop close, hash navigation after unlocking, route changes, filtering,
all image loads, preview navigation and focus restoration, fixed support position,
correct external URLs, reduced motion, and the emulated iPhone Chrome body-scroll
path. No real messages, orders, sign-outs, or customer-data writes are submitted.
Physical iPhone testing is still necessary.
