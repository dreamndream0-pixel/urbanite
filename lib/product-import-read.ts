import { load, loadBuffer } from 'cheerio';
import { extractUrl } from './extract-url';
import { fetchPublic, publicUrl } from './public-fetch';
import { canonicalProductUrl, importUrl, parseProductPage, parseShopifyProduct, productsAndPages } from './product-import-parse';
import { IMPORT_PAGE_SIZE, type ImportedProduct, type ProductDiscovery } from './product-import-types';

export function normalizeImportUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('請填寫公開商品或商店網址');
  try { return canonicalProductUrl(publicUrl(extractUrl(value)).href); }
  catch { throw new Error('只接受公開的 HTTP / HTTPS 網址，不可使用內網或帶有登入資訊的網址'); }
}

async function page(url: string) {
  const fetched = await fetchPublic(url, 4_000_000);
  if (!fetched.res.ok) throw new Error([401, 403, 429].includes(fetched.res.status) ? '來源網站限制讀取或要求登入，無法自動搬移；請改用公開商品網址' : `來源頁面讀取失敗（${fetched.res.status}）`);
  const type = fetched.res.headers.get('content-type') || '';
  if (type && !/html|xml|json|text\/plain/i.test(type)) throw new Error('這不是可辨識的商品頁或商品目錄');
  const bytes = Buffer.from(await fetched.res.arrayBuffer());
  const html = /html/i.test(type) || !type
    ? loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8', transportLayerEncodingLabel: type.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] } }).html()
    : bytes.toString('utf8');
  return { url: fetched.url, html, type };
}

export async function readImportedProduct(raw: string): Promise<ImportedProduct> {
  const source = normalizeImportUrl(raw);
  const fetched = await page(source);
  const $ = load(fetched.html);
  const shopify = /Shopify\.shop|cdn\.shopify\.com|shopify-section|Shopify\.currency/.test(fetched.html);
  if (shopify && /\/products\/[^/]+/.test(new URL(fetched.url).pathname)) {
    const endpoint = new URL(fetched.url);
    endpoint.pathname = `${endpoint.pathname.replace(/\.js$/, '').replace(/\/$/, '')}.js`;
    endpoint.search = '';
    let data: Record<string, unknown> | null = null;
    try {
      const result = await fetchPublic(endpoint.href, 2_000_000);
      if (result.res.ok) {
        data = await result.res.json() as Record<string, unknown>;
      }
    } catch { /* Generic structured-data parsing remains available. */ }
    if (data) {
      const currency = $('meta[property="product:price:currency"],meta[property="og:price:currency"],[itemprop="priceCurrency"]').first().attr('content') || fetched.html.match(/Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/)?.[1] || '';
      return parseShopifyProduct({ ...data, currency: data.currency || currency }, fetched.url);
    }
  }
  return parseProductPage(fetched.html, fetched.url);
}

export async function discoverProducts(rootRaw: string, taskRaw: string, offset = 0, seed = false): Promise<ProductDiscovery> {
  const root = normalizeImportUrl(rootRaw);
  const task = normalizeImportUrl(taskRaw);
  if (new URL(root).origin !== new URL(task).origin) throw new Error('整店掃描不可跨到其他網站');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new Error('掃描進度格式錯誤');
  const fetched = await page(task);
  if (!seed && new URL(fetched.url).origin !== new URL(root).origin) throw new Error('來源分頁跳轉到其他網站，已略過');
  const effectiveRoot = seed ? normalizeImportUrl(fetched.url) : root;
  const origin = new URL(effectiveRoot).origin;
  const safe = (v: string) => { const u = importUrl(v, fetched.url); return u && new URL(u).origin === origin ? canonicalProductUrl(u) : ''; };
  let products: string[] = [];
  let pages: string[] = [];
  const warnings: string[] = [];
  if (new URL(task).pathname.endsWith('/robots.txt')) {
    pages = fetched.html.split(/\r?\n/).filter((line) => /^sitemap\s*:/i.test(line)).map((line) => safe(line.slice(line.indexOf(':') + 1).trim())).filter(Boolean);
  } else if (/xml/i.test(fetched.type) || /^\s*(?:<\?xml[^>]*>\s*)?<(?:sitemapindex|urlset)\b/i.test(fetched.html)) {
    const $ = load(fetched.html, { xmlMode: true });
    const urls = $('loc').toArray().map((el) => safe($(el).text())).filter(Boolean);
    if ($('sitemapindex').length) pages = urls;
    else products = urls.filter((u) => !/\.(?:png|jpe?g|webp|gif|pdf|xml)(?:\?|$)/i.test(u) && !/\/(?:blogs?|articles?|polic(?:y|ies)|account|cart|checkout)(?:\/|$)/i.test(new URL(u).pathname));
  } else {
    ({ products, pages } = productsAndPages(fetched.html, fetched.url));
    if (seed && !/\/(?:shop|store|seller|stores)\/[^/]+/i.test(new URL(effectiveRoot).pathname)) pages.push(`${origin}/robots.txt`, `${origin}/sitemap.xml`);
    const $ = load(fetched.html);
    if (/captcha|access denied|verify you are human/i.test($('title').text())) throw new Error('來源網站要求驗證，無法自動掃描整店');
    if (!products.length && !pages.length) warnings.push('此頁沒有公開商品連結；動態載入或需登入的商品無法從公開頁完整讀取');
  }
  products = [...new Set(products)]; pages = [...new Set(pages)];
  // Chunk large sitemaps without silently dropping the remaining URLs.
  const entries = [...products.map((url) => ({ url, product: true })), ...pages.map((url) => ({ url, product: false }))];
  const chunk = entries.slice(offset, offset + IMPORT_PAGE_SIZE);
  return { root: effectiveRoot, url: fetched.url, products: chunk.filter((e) => e.product).map((e) => e.url), pages: chunk.filter((e) => !e.product).map((e) => e.url), nextOffset: offset + IMPORT_PAGE_SIZE < entries.length ? offset + IMPORT_PAGE_SIZE : null, warnings };
}
