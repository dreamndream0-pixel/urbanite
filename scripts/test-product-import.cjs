/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sharp = require('sharp');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => { if (name in mocks) return mocks[name]; if (name.startsWith('.') || name.startsWith('@/')) throw new Error(`Unexpected import ${name}`); return require(name); }, mod, mod.exports);
  return mod.exports;
}
const safe = load('lib/public-fetch.ts');
const types = load('lib/product-import-types.ts');
const parse = load('lib/product-import-parse.ts', { './public-fetch': safe, './product-import-types': types });
const source = 'https://merchant.example/products/pack';
const productJson = { '@context': 'https://schema.org', '@type': 'ProductGroup', name: '禮盒', description: '<p>產品介紹<strong>內容</strong></p><img src="/detail.jpg" onerror="alert(1)">', image: ['/a.jpg', '/b.jpg'], url: source, variesBy: ['https://schema.org/size'], hasVariant: [
  { '@type': 'Product', name: '禮盒 1入', size: '1入', image: '/a.jpg', offers: { '@type': 'Offer', price: '100', priceCurrency: 'TWD', inventoryLevel: { value: 3 } } },
  { '@type': 'Product', name: '禮盒 5入', size: '5入', offers: { '@type': 'Offer', price: '450', priceCurrency: 'TWD', availability: 'https://schema.org/InStock' } },
] };
const html = (value, extra = '') => `<html><head><script type="application/ld+json">${JSON.stringify(value)}</script></head><body>${extra}</body></html>`;
const product = parse.parseProductPage(html(productJson), source);
assert.equal(product.name, '禮盒');
assert.equal(product.price, 100);
assert.equal(product.currency, 'TWD');
assert.deepEqual(product.specs, [{ name: '尺寸', options: ['1入', '5入'] }]);
assert.deepEqual(product.variants.map((v) => v.price), [100, 450]);
assert.deepEqual(product.variants.map((v) => v.inventory), [3, null]);
assert.equal(product.images.length, 2);
assert.ok(product.warnings.includes('來源未公開實際庫存'));
assert.ok(!product.description.includes('onerror'));
assert.equal(parse.importUrl('', source), '');
assert.equal(parse.importUrl('javascript:alert(1)', source), '');
const dirty = parse.sanitizeProductDescription('<script>evil()</script><iframe src="https://bad.example"></iframe><p style="position:fixed" onclick="evil()">安全</p><a href="javascript:evil()">x</a><img src="data:image/svg+xml,x"><img src="/good.jpg">', source);
assert.ok(!/script|iframe|onclick|style=|javascript|data:/i.test(dirty));
assert.deepEqual(parse.descriptionImageUrls(dirty), ['https://merchant.example/good.jpg']);
assert.ok(parse.replaceDescriptionImages(dirty, new Map([['https://merchant.example/good.jpg', 'https://assets.example/stored.webp']])).includes('https://assets.example/stored.webp'));
for (const value of [-1, '1-200', '', '100元起', Infinity, null]) assert.equal(parse.importMoney(value), null);
assert.equal(parse.importMoney('NT$ 1,280'), 1280);
assert.equal(parse.canonicalProductUrl(`${source}/?utm_source=ad&variant=1&item=4#top`), `${source}?item=4&variant=1`);
assert.notEqual(parse.canonicalProductUrl(`${source}?ref=product-a`), parse.canonicalProductUrl(`${source}?ref=product-b`));
const shopeeSource = 'https://shopee.tw/product/4390451/5745868376';
assert.equal(parse.canonicalProductUrl(`${shopeeSource}?d_id=abc&uls_trackid=random&utm_content=share`), shopeeSource);
assert.equal(parse.canonicalProductUrl('https://www.shopee.tw/example-product-i.4390451.5745868376?sp_atk=random'), shopeeSource);
assert.equal(parse.canonicalProductUrl('https://shopee.tw/seller?shop=1&category=2'), 'https://shopee.tw/seller?category=2&shop=1');
assert.equal(parse.canonicalProductUrl('https://shopee.tw.evil.example/product/1/2?ref=keep'), 'https://shopee.tw.evil.example/product/1/2?ref=keep');
const shopeeShell = '<html><head><meta name="apple-mobile-web-app-title" content="Shopee"></head><body><script type="text/shopee-page-manifest">{}</script><noscript>Please enable JavaScript on your browser.</noscript></body></html>';
assert.throws(() => parse.parseProductPage(shopeeShell, shopeeSource), /動態載入頁/);
assert.throws(() => parse.productsAndPages(shopeeShell, 'https://shopee.tw/example-shop'), /動態載入頁/);
for (const blocked of ['https://shopee.tw/verify/traffic/error?type=4', 'https://shopee.tw/buyer/login']) {
  const pattern = blocked.includes('verify') ? /流量驗證/ : /要求登入/;
  assert.throws(() => parse.parseProductPage('<h1>登入或驗證</h1>', blocked), pattern);
  assert.throws(() => parse.productsAndPages('<h1>登入或驗證</h1>', blocked), pattern);
}
const shopeePublic = parse.parseProductPage(html({ '@type': 'Product', name: '公開商品', image: '/a.jpg', offers: { price: '100', priceCurrency: 'TWD' } }), shopeeSource);
assert.equal(shopeePublic.name, '公開商品');
assert.equal(shopeePublic.price, 100);
assert.throws(() => parse.parseProductPage('<title>Access denied</title>', source), /驗證|拒絕/);
assert.throws(() => parse.parseProductPage(html([{ '@type': 'Product', url: '/products/other', name: 'A' }, { '@type': 'Product', url: '/products/other2', name: 'B' }]), source), /商品列表/);
const generic = parse.parseProductPage('<meta property="og:title" content="通用商品"><meta property="og:image" content="/a.jpg"><meta property="product:price:amount" content="99"><meta property="product:price:currency" content="TWD"><form><select name="options[size]"><option value="">請選擇</option><option value="S">S</option><option value="M">M</option></select></form>', source);
assert.equal(generic.reviewRequired, true);
assert.equal(generic.specs[0].options.length, 2);
assert.ok(types.importProblems(generic, 2, false).includes('規格組合尚未完整'));
const woo = parse.parseProductPage(html({ '@type': 'Product', name: 'Woo', url: source, image: '/a.jpg', offers: { price: '99', priceCurrency: 'TWD' } }, `<form class="variations_form" data-product_variations='${JSON.stringify([{ attributes: { attribute_pa_size: 'small' }, display_price: 99, is_in_stock: false }, { attributes: { attribute_pa_size: 'large' }, display_price: 199, is_in_stock: true }])}'><label for="size">尺寸</label><select id="size" name="attribute_pa_size"><option value="small">小</option><option value="large">大</option></select></form>`), source);
assert.deepEqual(woo.variants.map((v) => v.options), [['小'], ['大']]);
assert.deepEqual(woo.variants.map((v) => v.price), [99, 199]);
assert.deepEqual(woo.variants.map((v) => v.inventory), [0, null]);
const shopifyData = { title: 'Shopify商品', price: 10000, currency: 'TWD', images: ['/a.jpg'], description: '<p>產品</p>', options: [{ name: '入數' }], variants: [{ options: ['1入'], price: 10000, available: true }, { options: ['5入'], price: 45000, available: false }] };
const shopify = parse.parseShopifyProduct(shopifyData, source);
assert.equal(shopify.price, 100); assert.deepEqual(shopify.variants.map((v) => v.price), [100, 450]);
assert.deepEqual(shopify.variants.map((v) => v.inventory), [null, 0]);
assert.throws(() => parse.parseShopifyProduct({ ...shopifyData, variants: Array(201).fill(shopifyData.variants[0]) }, source), /200/);
const links = parse.productsAndPages(`<a href="/products/one?utm_source=ad">A</a><a href="https://other.example/products/foreign">Other</a><a href="/collections/all?page=2">Next</a><a href="/cart">Cart</a><a href="/custom-item"><img src="/x.jpg">NT$ 990</a>`, source);
assert.deepEqual(links.products, ['https://merchant.example/products/one', 'https://merchant.example/custom-item']);
assert.deepEqual(links.pages, ['https://merchant.example/collections/all?page=2']);
const catalog = parse.productsAndPages(html({ '@graph': [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', item: { '@id': 'https://merchant.example/terms' } }] }, { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', item: { '@id': 'https://merchant.example/product-detail?id=4' } }] }] }, '<div class="product-card"><a href="/custom-detail?id=5"><img src="/a.jpg"></a></div>'), source);
assert.deepEqual(catalog.products, ['https://merchant.example/product-detail?id=4', 'https://merchant.example/custom-detail?id=5']);

(async () => {
  const extraction = load('lib/extract-url.ts');
  let network = new Map();
  const requested = [];
  const fetched = { ...safe, fetchPublic: async (url) => { requested.push(url); const result = network.get(url); if (!result) return { url, res: new Response('missing', { status: 404 }) }; return { url: result.url || url, res: new Response(result.body, { status: result.status || 200, headers: { 'content-type': result.type || 'text/html' } }) }; } };
  const read = load('lib/product-import-read.ts', { './extract-url': extraction, './public-fetch': fetched, './product-import-parse': parse, './product-import-types': types });
  for (const url of ['http://127.0.0.1/a', 'http://10.0.0.1', 'file:///x', 'https://u:p@merchant.example']) assert.throws(() => read.normalizeImportUrl(url));
  const shortUrl = 'https://tw.shp.ee/3T9UEXXQ';
  network.set(shortUrl, { url: `${shopeeSource}?uls_trackid=random`, body: shopeeShell });
  await assert.rejects(() => read.readImportedProduct(shortUrl), /動態載入頁/);
  await assert.rejects(() => read.discoverProducts(shortUrl, shortUrl, 0, true), /動態載入頁/);
  network.set(shortUrl, { url: 'https://shopee.tw/verify/traffic/error', body: '<h1>驗證</h1>' });
  await assert.rejects(() => read.readImportedProduct(shortUrl), /流量驗證/);
  await assert.rejects(() => read.discoverProducts(shortUrl, shortUrl, 0, true), /流量驗證/);
  network.set(shortUrl, { url: `${shopeeSource}?uls_trackid=changing`, body: html({ '@type': 'Product', name: '可公開讀取商品', image: '/a.jpg', offers: { price: '99', priceCurrency: 'TWD' } }) });
  assert.equal((await read.readImportedProduct(shortUrl)).sourceUrl, shopeeSource);
  network.set(source, { body: html(productJson) });
  assert.equal((await read.readImportedProduct(source)).variants[1].price, 450);
  const graph = { '@graph': [{ '@type': 'Product', name: '參照價格', image: '/a.jpg', url: source, offers: { '@id': '#offer' } }, { '@id': '#offer', '@type': 'Offer', price: 88, priceCurrency: 'TWD' }] };
  assert.equal(parse.parseProductPage(html(graph), source).price, 88);
  const legacy = require('iconv-lite').encode('<meta charset="big5"><h1>中文商品</h1><meta property="og:image" content="/a.jpg">', 'big5');
  network.set(`${source}-legacy`, { body: legacy, type: 'text/html; charset=big5' });
  assert.equal((await read.readImportedProduct(`${source}-legacy`)).name, '中文商品');
  network.set(source, { body: '<script>Shopify.shop="store";</script><meta property="product:price:currency" content="TWD">' });
  network.set(`${source}.js`, { body: JSON.stringify(shopifyData), type: 'application/json' });
  assert.equal((await read.readImportedProduct(source)).price, 100);
  network.set(source, { body: '<a href="/products/a">A</a><a href="/collections/all?page=2">Next</a>' });
  const discovered = await read.discoverProducts('https://merchant.example', source, 0, true);
  assert.deepEqual(discovered.products, ['https://merchant.example/products/a']);
  assert.ok(discovered.pages.includes('https://merchant.example/sitemap.xml'));
  await assert.rejects(() => read.discoverProducts(source, 'https://other.example/sitemap.xml'), /跨/);
  network.set('https://merchant.example/sitemap.xml', { type: 'application/xml', body: `<urlset>${Array.from({ length: 205 }, (_, i) => `<url><loc>https://merchant.example/unique/${i}</loc></url>`).join('')}</urlset>` });
  const first = await read.discoverProducts(source, 'https://merchant.example/sitemap.xml');
  assert.equal(first.products.length, 200); assert.equal(first.nextOffset, 200);
  const last = await read.discoverProducts(source, 'https://merchant.example/sitemap.xml', 200);
  assert.equal(last.products.length, 5); assert.equal(last.nextOffset, null);

  const image = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#eeeeee' } }).jpeg().toBuffer();
  const imageFetch = { ...safe, fetchPublic: async (url) => ({ url, res: new Response(image, { headers: { 'content-type': 'image/jpeg' } }) }) };
  const apply = load('lib/product-import-apply.ts', { './public-fetch': imageFetch, './product-import-parse': parse, './product-import-types': types });
  const shop = { id: 'shop-1', slug: 'merchant' };
  let existing = null; let failUpload = false; let failInsert = false;
  const inserted = []; const uploads = []; const removed = []; const journals = [];
  const db = { from(table) {
    let payload;
    const chain = { select: () => chain, eq: () => chain, insert: (data) => { payload = data; return chain; },
      maybeSingle: async () => ({ data: table === 'products' ? existing : { slug: 'gifts' }, error: null }),
      single: async () => { if (!failInsert) inserted.push(payload); return { data: failInsert ? null : payload, error: failInsert ? { message: 'Insert failed' } : null }; },
      then: (done) => { if (table === 'stock_movements') journals.push(payload); return Promise.resolve({ error: null }).then(done); },
    }; return chain;
  }, storage: { from() { return {
    upload: async (path, bytes) => { if (failUpload) return { error: { message: 'Image failed' } }; uploads.push(path); assert.equal((await sharp(bytes).metadata()).format, 'webp'); return { error: null }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://assets.example/${path}` } }), remove: async (paths) => { removed.push(...paths); return { error: null }; },
  }; } } };
  assert.notEqual(apply.importedProductId(shop, source), apply.importedProductId({ ...shop, id: 'shop-2' }, source));
  assert.equal(apply.importedProductId(shop, source), apply.importedProductId(shop, `${source}?utm_source=ad`));
  await assert.rejects(() => apply.applyImportedProduct(db, shop, product, { publish: true }, 'Owner'), /庫存/);
  const result = await apply.applyImportedProduct(db, shop, product, { stock: 7, publish: true, category: 'gifts' }, 'Owner');
  assert.equal(result.status, 'created'); assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0].variants.map((v) => v.inventory), [3, 7]);
  assert.deepEqual(inserted[0].variants.map((v) => v.price), [100, 450]);
  assert.equal(inserted[0].inventory, 10); assert.equal(inserted[0].status, '上架中');
  assert.ok(inserted[0].images.every((src) => src.startsWith('https://assets.example/')));
  assert.ok(!inserted[0].tagline.includes('merchant.example/detail.jpg'));
  assert.equal(journals[0].length, 2);
  existing = inserted[0]; const uploadCount = uploads.length;
  assert.equal((await apply.applyImportedProduct(db, shop, product, { stock: 7, publish: true }, 'Owner')).status, 'duplicate');
  assert.equal(uploads.length, uploadCount, 'Duplicate imports must not upload again');
  existing = null; failInsert = true;
  await assert.rejects(() => apply.applyImportedProduct(db, shop, product, { stock: 7 }, 'Owner'), /Insert failed/);
  assert.equal(removed.length, 3, 'All staged gallery and description files must be cleaned after failed insert');
  failInsert = false; failUpload = true;
  await assert.rejects(() => apply.applyImportedProduct(db, shop, product, { stock: 7 }, 'Owner'), /Image failed/);
  assert.equal(inserted.length, 1, 'Failed images must not create any product');
  assert.ok(types.importProblems({ ...product, currency: 'USD' }, 2, true).some((p) => p.includes('新臺幣')));
  assert.ok(types.importProblems({ ...product, reviewRequired: true }, 2, false).includes('請確認辨識結果'));

  let admin = null; let limited = false; let reads = 0; let applies = 0;
  const route = load('app/api/products/import/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/supabase/server': { getAdminUser: async () => admin }, '@/lib/shop': { requireCurrentShop: async () => shop, shopAdminClient: async () => db },
    '@/lib/account-rate-limit': { accountRateLimit: () => !limited, rateLimitResponse: () => Response.json({}, { status: 429 }) },
    '@/lib/product-import-read': { readImportedProduct: async () => { reads++; return product; }, discoverProducts: read.discoverProducts },
    '@/lib/product-import-apply': { applyImportedProduct: async (_db, actualShop) => { applies++; assert.equal(actualShop.id, shop.id); return { status: 'created', product: inserted[0], warnings: [] }; } },
  });
  const req = (body) => new Request('https://shop.test/api/products/import', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await route.POST(req({ action: 'read', url: source }))).status, 401); assert.equal(reads, 0);
  admin = { id: 'owner', email: 'owner@example.invalid' };
  assert.equal((await route.POST(req({ action: 'read', url: source }))).status, 200); assert.equal(reads, 1);
  assert.equal((await route.POST(req({ action: 'apply', product }))).status, 400); assert.equal(applies, 0);
  assert.equal((await route.POST(req({ action: 'apply', rights: true, product, shop_id: 'other-shop' }))).status, 201); assert.equal(applies, 1);
  assert.equal((await route.POST(req({ action: 'unknown' }))).status, 400);
  assert.equal((await route.POST(req({ action: 'read', big: 'x'.repeat(250001) }))).status, 400);
  limited = true; assert.equal((await route.POST(req({ action: 'read' }))).status, 429);
  console.log('Product import: generic JSON-LD/ProductGroup, WooCommerce, Shopify minor-unit prices, HTML fallback, inert HTML, canonical/dedup URLs, sitemap continuation, same-origin scope, SSRF URL checks, missing stock/currency/review gates, image rehosting, failed-image no-write/cleanup, initial inventory journal, tenant IDs, authorization, rate and body limits passed. All remote reads and database/storage writes mocked.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
