import { load, type CheerioAPI } from 'cheerio';
import { publicUrl } from './public-fetch';
import { IMPORT_MAX_VARIANTS, type ImportedProduct } from './product-import-types';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const array = (v: unknown): unknown[] => v == null ? [] : Array.isArray(v) ? v : [v];
const string = (v: unknown): string => typeof v === 'string' || typeof v === 'number' ? String(v) : '';
export const importText = (v: unknown, max = 1000) => load(string(v)).text().replace(/\s+/g, ' ').trim().slice(0, max);

export function importUrl(value: unknown, base: string): string {
  if (!string(value).trim()) return '';
  try { return publicUrl(new URL(string(value), base).href).href; } catch { return ''; }
}
export function canonicalProductUrl(raw: string): string {
  const url = publicUrl(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.href;
}
export function importMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= 1_000_000_000 ? v : null;
  const text = string(v).trim().replace(/^(?:NT\$|NTD|TWD|\$)\s*/i, '').replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) return null;
  return importMoney(Number(text));
}
const inventory = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000 ? v : null;
const stockOf = (v: Obj) => inventory(v.inventory_quantity) ?? inventory(v.stock_quantity) ?? inventory(obj(v.inventoryLevel).value) ?? (/OutOfStock|SoldOut|Discontinued/i.test(string(v.availability)) || v.available === false || v.is_in_stock === false ? 0 : null);
const currencyOf = (v: unknown) => /^(TWD|NTD|NT\$)$/i.test(string(v).trim()) ? 'TWD' : string(v).trim().toUpperCase().slice(0, 8);

// Only inert content survives; imported pages never execute scripts in the storefront.
export function sanitizeProductDescription(html: string, base: string): string {
  const $ = load(html.slice(0, 100_000), undefined, false);
  $('script,style,iframe,object,embed,svg,math,form,input,button,textarea,select,link,meta,noscript,template').remove();
  const allowed = new Set('p br div span strong b em i u s ul ol li h2 h3 h4 blockquote table thead tbody tr th td a img hr'.split(' '));
  $('*').each((_, el) => {
    if (!('tagName' in el) || !('attribs' in el)) return;
    const tag = el.tagName.toLowerCase();
    if (!allowed.has(tag)) { $(el).replaceWith($(el).contents()); return; }
    const attrs = { ...el.attribs };
    for (const key of Object.keys(attrs)) $(el).removeAttr(key);
    if (tag === 'a') {
      const href = importUrl(attrs.href, base);
      if (href) $(el).attr({ href, target: '_blank', rel: 'noopener noreferrer' });
    }
    if (tag === 'img') {
      const src = importUrl(attrs.src || attrs['data-src'], base);
      if (!src) $(el).remove();
      else $(el).attr({ src, alt: importText(attrs.alt, 160), loading: 'lazy' });
    }
  });
  return $.html().slice(0, 30_000);
}

function imagesOf(value: unknown, base: string): string[] {
  return [...new Set(array(value).flatMap((v) => {
    if (typeof v === 'string') return [importUrl(v, base)];
    const image = obj(v);
    return [importUrl(image.url || image.contentUrl || image.src, base)];
  }).filter(Boolean))];
}
const typeOf = (v: Obj, name: string) => array(v['@type']).some((t) => string(t).split(/[/#]/).pop() === name);
function jsonNodes($: CheerioAPI): Obj[] {
  const nodes: Obj[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 25 || nodes.length >= 10_000) return;
    if (Array.isArray(value)) { value.slice(0, 5000).forEach((v) => walk(v, depth + 1)); return; }
    if (!value || typeof value !== 'object') return;
    const o = obj(value); nodes.push(o);
    Object.values(o).forEach((v) => { if (v && typeof v === 'object') walk(v, depth + 1); });
  };
  $('script[type="application/ld+json"]').each((_, el) => { try { walk(JSON.parse($(el).text()), 0); } catch { /* Other scripts may still contain usable data. */ } });
  return nodes;
}
const offersOf = (v: Obj) => array(v.offers).flatMap((o) => array(obj(o).offers).length ? array(obj(o).offers).map(obj) : [obj(o)]);
const offerPrice = (v: Obj) => importMoney(v.price) ?? importMoney(obj(v.priceSpecification).price);
const meta = ($: CheerioAPI, key: string) => $(`meta[property="${key}"],meta[name="${key}"]`).first().attr('content') ?? '';

function finalize(product: ImportedProduct): ImportedProduct {
  const images = [...new Set(product.images)];
  if (images.length > 10) { product.warnings.push('來源商品照片超過 10 張，已保留前 10 張'); product.reviewRequired = true; }
  product.images = images.slice(0, 10);
  const description = load(product.description, undefined, false);
  if (description('img').length > 20) { description('img').slice(20).remove(); product.description = description.html(); product.warnings.push('商品介紹超過 20 張圖片，已保留前 20 張'); product.reviewRequired = true; }
  if (Object.keys(product.colorImages).length > 10) { product.colorImages = Object.fromEntries(Object.entries(product.colorImages).slice(0, 10)); product.warnings.push('規格照片超過 10 張，已保留前 10 張'); product.reviewRequired = true; }
  if (!product.name) throw new Error('沒有讀到商品標題，請確認是公開商品頁');
  if (!product.images.length) product.warnings.push('沒有讀到商品照片');
  if (product.price === null) product.warnings.push('沒有讀到單一售價');
  if (product.currency !== 'TWD') product.warnings.push(product.currency ? `原幣別為 ${product.currency}，請換算新臺幣` : '來源未標示幣別，請確認售價');
  if (!product.description) product.warnings.push('沒有讀到完整商品介紹');
  if (product.inventory === null || product.variants.some((v) => v.inventory === null)) product.warnings.push('來源未公開實際庫存');
  if (product.variants.some((v) => v.price === null)) product.warnings.push('部分規格沒有售價');
  if (product.specs.length && !product.variants.length) product.warnings.push('讀到規格選項，但沒有完整規格組合與售價');
  product.warnings = [...new Set(product.warnings)];
  return product;
}

export function parseShopifyProduct(value: unknown, source: string): ImportedProduct {
  const p = obj(value);
  if (!p.title || !Array.isArray(p.variants)) throw new Error('商品公開資料格式無法辨識');
  const raw = p.variants as Obj[];
  if (raw.length > IMPORT_MAX_VARIANTS) throw new Error(`此商品超過 ${IMPORT_MAX_VARIANTS} 個規格組合，請拆分後匯入`);
  const dims = array(p.options).map((option, i) => ({ name: importText(obj(option).name || option, 40), options: [...new Set(raw.map((v) => importText(array(v.options)[i] || v[`option${i + 1}`], 80)).filter(Boolean))] }));
  const standard = dims.length === 1 && /^(title|標題)$/i.test(dims[0].name) && dims[0].options.length === 1 && /^(default title|預設)$/i.test(dims[0].options[0]);
  const specs = standard ? [] : dims;
  const price = importMoney(p.price);
  const variants = specs.length ? raw.map((v) => ({ options: specs.map((_, i) => importText(array(v.options)[i] || v[`option${i + 1}`], 80)), price: importMoney(v.price) === null ? null : Number(v.price) / 100, inventory: stockOf(v) })) : [];
  const colorImages: Record<string, string> = {};
  raw.forEach((v) => { const key = importText(array(v.options)[0] || v.option1, 80); const image = imagesOf(v.featured_image, source)[0]; if (key && image) colorImages[key] = image; });
  const canonical = new URL(source); canonical.searchParams.delete('variant');
  return finalize({ sourceUrl: canonicalProductUrl(canonical.href), name: importText(p.title, 200), description: sanitizeProductDescription(string(p.description || p.body_html), source), images: imagesOf(p.images, source), price: price === null ? null : price / 100, originalPrice: importMoney(p.compare_at_price) === null ? null : Number(p.compare_at_price) / 100, currency: currencyOf(p.currency), specs, variants, inventory: specs.length ? null : stockOf(raw[0] ?? p), category: importText(p.type || p.product_type, 100), colorImages, warnings: [], reviewRequired: false });
}

export function parseProductPage(html: string, source: string): ImportedProduct {
  const $ = load(html);
  if (/captcha|verify you are human|access denied|驗證您是人類/i.test($('title').text())) throw new Error('來源網站要求驗證或拒絕讀取，請使用公開商品網址或匯出資料');
  const nodes = jsonNodes($);
  const references = new Map<string, Obj>();
  for (const node of nodes) if (node['@id'] && Object.keys(node).length > Object.keys(references.get(string(node['@id'])) ?? {}).length) references.set(string(node['@id']), node);
  const deref = (v: unknown) => { const o = obj(v); return references.get(string(o['@id'])) ?? o; };
  const resolvedOffers = (v: Obj) => offersOf({ offers: array(v.offers).map((value) => { const offer = deref(value); return { ...offer, ...(offer.offers ? { offers: array(offer.offers).map(deref) } : {}) }; }) });
  const canon = importUrl($('link[rel="canonical"]').attr('href'), source);
  const canonical = canon && new URL(canon).origin === new URL(source).origin ? canonicalProductUrl(canon) : canonicalProductUrl(source);
  const candidates = nodes.filter((n) => typeOf(n, 'ProductGroup') || typeOf(n, 'Product'));
  const matchesPage = (n: Obj) => { const url = importUrl(n.url || n['@id'], source); return url && canonicalProductUrl(url).split('?')[0] === canonical.split('?')[0]; };
  candidates.sort((a, b) => (Number(matchesPage(b)) * 100 + Number(typeOf(b, 'ProductGroup')) * 10) - (Number(matchesPage(a)) * 100 + Number(typeOf(a, 'ProductGroup')) * 10));
  const p = candidates[0] ?? {};
  if (candidates.length > 1 && !matchesPage(p) && !typeOf(p, 'ProductGroup') && !/product/i.test(meta($, 'og:type'))) throw new Error('這是商品列表，請改用整店模式或貼上單一商品網址');
  const offers = resolvedOffers(p);
  const rootOffer = offers[0] ?? {};
  const price = offerPrice(rootOffer) ?? importMoney($('[itemprop="price"]').first().attr('content') || $('[itemprop="price"]').first().text()) ?? importMoney(meta($, 'product:price:amount') || meta($, 'og:price:amount'));
  const currency = currencyOf(rootOffer.priceCurrency || meta($, 'product:price:currency') || meta($, 'og:price:currency') || $('[itemprop="priceCurrency"]').attr('content'));
  const descriptionNode = $('[itemprop="description"],#tab-description,.woocommerce-product-details__short-description,.product-description,.product__description,[data-product-description]').first();
  const description = sanitizeProductDescription(string(p.description) || descriptionNode.html() || meta($, 'og:description') || meta($, 'description'), source);
  const product: ImportedProduct = { sourceUrl: canonical, name: importText(p.name || $('[itemprop="name"]').first().text() || $('h1').first().text() || meta($, 'og:title'), 200), description, images: imagesOf(p.image, source), price, originalPrice: null, currency, specs: [], variants: [], inventory: stockOf(rootOffer) ?? stockOf(p), category: importText(p.category, 100), colorImages: {}, warnings: [], reviewRequired: !candidates.length };
  if (!p.description && !descriptionNode.length && description) { product.reviewRequired = true; product.warnings.push('目前僅讀到頁面摘要，請核對完整商品介紹'); }
  if (!product.images.length) product.images = imagesOf(meta($, 'og:image') || $('[itemprop="image"]').first().attr('src'), source);
  $('[itemprop="image"],.woocommerce-product-gallery img,.product__media img,.product-gallery img,[data-product-gallery] img').each((_, el) => {
    const src = importUrl($(el).attr('data-large_image') || $(el).attr('data-zoom-image') || $(el).attr('data-src') || $(el).attr('src') || $(el).attr('content'), source);
    if (src) product.images.push(src);
  });
  // ProductGroup variants have explicit combinations; never invent a Cartesian stock matrix.
  const children = array(p.hasVariant).map(deref);
  if (children.length > IMPORT_MAX_VARIANTS) throw new Error(`此商品超過 ${IMPORT_MAX_VARIANTS} 個規格組合`);
  if (children.length) {
    const known: Record<string, string> = { color: '顏色', size: '尺寸', material: '材質', pattern: '款式', model: '型號' };
    const declared = array(p.variesBy).map((v) => string(obj(v)['@id'] || obj(v).name || v).split(/[/#]/).pop() || '').filter(Boolean);
    const additional = children.flatMap((v) => array(v.additionalProperty).map(obj).map((a) => string(a.name || a.propertyID))).filter(Boolean);
    const names = [...new Set([...declared, ...Object.keys(known).filter((key) => children.some((v) => string(v[key]))), ...additional])].filter((key) => children.some((v) => string(v[key]) || array(v.additionalProperty).map(obj).some((a) => string(a.name || a.propertyID) === key)));
    if (names.length > 5) throw new Error('來源商品超過五種規格維度，請拆分後匯入');
    const valueOf = (v: Obj, key: string) => { const value = v[key] || array(v.additionalProperty).map(obj).find((a) => string(a.name || a.propertyID) === key)?.value; return importText(obj(value).name || obj(value).value || value, 80); };
    product.specs = names.map((key) => ({ name: known[key] || importText(key, 40), options: [...new Set(children.map((v) => valueOf(v, key)).filter(Boolean))] }));
    product.variants = children.map((v) => { const offer = resolvedOffers(v)[0] ?? {}; return { options: names.map((key) => valueOf(v, key)), price: offerPrice(offer), inventory: stockOf(offer) }; });
    if (!names.length || product.variants.some((v) => v.options.some((o) => !o))) { product.reviewRequired = true; product.warnings.push('來源的規格對應不完整'); }
    if (!product.currency) product.currency = currencyOf(resolvedOffers(children[0])[0]?.priceCurrency);
    const currencies = [...new Set(children.flatMap((v) => resolvedOffers(v).map((offer) => currencyOf(offer.priceCurrency))).filter(Boolean))];
    if (currencies.length > 1) { product.currency = 'MIXED'; product.reviewRequired = true; product.warnings.push('規格使用不同幣別，請確認新臺幣售價'); }
    if (product.price === null && product.variants.every((v) => v.price !== null)) product.price = Math.min(...product.variants.map((v) => v.price!));
    product.images.push(...children.flatMap((v) => imagesOf(v.image, source)));
  }
  if (!children.length && offers.length > 1 && new Set(offers.map(offerPrice)).size > 1) { product.reviewRequired = true; product.warnings.push('來源有多組售價但沒有規格對應，請核對商品'); }
  // WooCommerce includes its variation matrix as JSON in the public form.
  const form = $('form.variations_form').first();
  if (form.length) {
    try {
      const values = JSON.parse(form.attr('data-product_variations') || 'null');
      if (Array.isArray(values) && values.length && values.length <= IMPORT_MAX_VARIANTS) {
        const dims = form.find('select[name^="attribute_"]').toArray().map((el) => ({ key: $(el).attr('name')!, name: importText($(`label[for="${$(el).attr('id')}"]`).first().text() || $(el).attr('data-attribute_name') || $(el).attr('name'), 40), choices: new Map($(el).find('option[value]').toArray().filter((o) => $(o).attr('value')).map((o) => [$(o).attr('value')!, importText($(o).text(), 80)])) }));
        product.specs = dims.map((d) => ({ name: d.name, options: [...d.choices.values()] }));
        product.variants = values.map((v: Obj) => ({ options: dims.map((d) => d.choices.get(string(obj(v.attributes)[d.key])) || ''), price: importMoney(v.display_price), inventory: stockOf(v) }));
        if (!dims.length || product.variants.some((v) => v.options.some((o) => !o))) { product.reviewRequired = true; product.warnings.push('部分規格需要手動確認'); }
      }
    } catch { product.reviewRequired = true; product.warnings.push('來源規格資料無法完整解析'); }
  }
  if (!product.specs.length) {
    $('form select[name*="option"],form select[name*="attribute"],[itemprop="offers"] select').slice(0, 5).each((_, el) => {
      const options = $(el).find('option[value]').toArray().filter((o) => $(o).attr('value')).map((o) => importText($(o).text(), 80));
      if (options.length) product.specs.push({ name: importText($(el).attr('aria-label') || $(el).attr('name') || '規格', 40), options: [...new Set(options)] });
    });
    $('section').each((_, el) => {
      const label = $(el).children('p').first().text().split(/[：:]/)[0].trim();
      if (!/^(顏色|尺寸|規格|入數|容量|款式|材質|大小)$/.test(label) || product.specs.some((s) => s.name === label)) return;
      const options = $(el).find('button').toArray().map((b) => importText($(b).attr('title') || $(b).text(), 80)).filter(Boolean);
      if (options.length) product.specs.push({ name: label, options: [...new Set(options)] });
    });
    if (product.specs.length) { product.reviewRequired = true; product.warnings.push('規格選項需確認組合與售價'); }
  }
  if (!candidates.length) product.warnings.push('使用頁面標題與商品欄位辨識，請確認內容完整');
  return finalize(product);
}

export function descriptionImageUrls(description: string): string[] {
  const $ = load(description, undefined, false);
  return [...new Set($('img').toArray().map((el) => $(el).attr('src') || '').filter(Boolean))];
}
export function replaceDescriptionImages(description: string, images: Map<string, string>): string {
  const $ = load(description, undefined, false);
  $('img').each((_, el) => { const src = images.get($(el).attr('src') || ''); if (src) $(el).attr('src', src); else $(el).remove(); });
  return $.html();
}

export function productsAndPages(html: string, base: string): { products: string[]; pages: string[] } {
  const $ = load(html);
  const origin = new URL(base).origin;
  const safe = (value: unknown) => { const url = importUrl(value, base); return url && new URL(url).origin === origin ? canonicalProductUrl(url) : ''; };
  const products = new Set<string>();
  const pages = new Set<string>();
  for (const node of jsonNodes($)) {
    if (typeOf(node, 'Product') || typeOf(node, 'ProductGroup')) { const url = safe(node.url || node['@id']); if (url) products.add(url); }
    if (typeOf(node, 'ItemList')) for (const entry of array(node.itemListElement)) { const list = obj(entry); const item = obj(list.item); const url = safe(list.url || item.url || item['@id'] || (typeof list.item === 'string' ? list.item : '')); if (url) products.add(url); }
  }
  $('a[href]').each((_, el) => {
    const href = safe($(el).attr('href')); if (!href || /\/(?:cart|checkout|account|login|logout|auth|search)(?:\/|\?|$)/i.test(href)) return;
    const path = new URL(href).pathname;
    const card = $(el).closest('[data-product-id],.product-card,.product-item,.product-card-wrapper,.product-grid-item,.product');
    if (/\/(?:products?|items?|goods|p)\/[^/]+/i.test(path) || /[?&](?:product_id|item_id|goods_id|pid)=/i.test(href) || $(el).closest('[itemtype$="/Product"]').length || (card.length && ($(el).find('img').length || $(el).closest('h2,h3').length)) || ($(el).find('img').length && /(?:NT\$|NTD|TWD|\$)\s*[\d,]+/.test($(el).text()))) products.add(href);
    else if (/\/(?:collections?|categor(?:y|ies)|shop|store|catalog)(?:\/|$)/i.test(path) || $(el).attr('rel')?.includes('next') || /[?&]page=\d+/i.test(href)) pages.add(href);
  });
  $('link[rel="next"],link[rel="sitemap"]').each((_, el) => { const url = safe($(el).attr('href')); if (url) pages.add(url); });
  return { products: [...products], pages: [...pages].filter((url) => !products.has(url)) };
}
