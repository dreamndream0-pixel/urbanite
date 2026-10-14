# Mobile scrolling regression checks

Public store, campaign and product pages share StoreHeader and useLoopCarousel.
Page headers are sticky on all devices (sticky keeps their space in the flow, so they
never cover content). Native vertical pan and pinch are
allowed on carousels; only horizontal pointer drags change slides. No touchmove
handler cancels document scrolling.

ScrollHero changes artwork transforms, not layout margins while scrolling.
Overlay scroll locks use one reference-counted owner set for html/body. Always use
useScrollLock instead of independently restoring document.body.style.overflow.
Hidden storefront drawers are inert and cannot receive focus or touch input.

Checks (a local dev server must be running):

```sh
node scripts/test-scroll-lock.cjs
node scripts/test-page-scroll.cjs
npm run build
```

Set PLAYWRIGHT_MODULE to the installed Playwright module if not in node_modules.
SCROLL_TEST_URL defaults to http://localhost:3011. The browser test uses native
Chromium touch input, tests public platform pages and the CHUE host, and opens
only read-only UI. It discovers a product link when available. To include a real
published campaign, set SCROLL_CAMPAIGN_PATH to its /promo/<slug> path. No orders,
notifications, or production data are modified.

Before release, also check on physical iPhone Safari and Chrome: scroll down/up
over banners, categories and products, rotate or expand/collapse browser chrome,
open/close menu/cart/favorites, open/close plan comparison, navigate back, and
confirm the page top remains reachable. Desktop/mobile emulation does not reproduce
every iOS browser-toolbar or keyboard behavior.

The activity view was additionally tested with a temporary fixture rendering the
same Storefront component with a campaign prop; this fixture is not deployed.
