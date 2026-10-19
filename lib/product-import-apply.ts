import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Shop } from './shop';
import type { Product } from './types';
import { fetchPublic, publicUrl } from './public-fetch';
import { canonicalProductUrl, descriptionImageUrls, importMoney, replaceDescriptionImages, sanitizeProductDescription } from './product-import-parse';
import { importProblems, IMPORT_MAX_VARIANTS, type ImportedProduct } from './product-import-types';

const string = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const stock = (v: unknown) => v === null || v === undefined ? null : typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000 ? v : (() => { throw new Error('庫存必須是 0 至 1000000 的整數'); })();
const url = (v: unknown) => publicUrl(string(v, 2000)).href;

export function validateImportedProduct(input: unknown): ImportedProduct {
  const v = record(input);
  if (!Array.isArray(v.images) || v.images.length > 10 || !Array.isArray(v.specs) || v.specs.length > 5 || !Array.isArray(v.variants) || v.variants.length > IMPORT_MAX_VARIANTS) throw new Error('商品圖片或規格格式錯誤');
  const sourceUrl = canonicalProductUrl(url(v.sourceUrl));
  const specs = v.specs.map((raw) => { const dim = record(raw); if (!Array.isArray(dim.options) || !dim.options.length || dim.options.length > 200) throw new Error('規格選項格式錯誤'); const name = string(dim.name, 40); const options = [...new Set(dim.options.map((o) => string(o, 80)))]; if (!name || options.some((o) => !o)) throw new Error('規格名稱及選項不可空白'); return { name, options }; });
  if (new Set(specs.map((dim) => dim.name)).size !== specs.length) throw new Error('規格名稱不可重複');
  const variants = v.variants.map((raw) => { const variant = record(raw); if (!Array.isArray(variant.options)) throw new Error('規格組合格式錯誤'); return { options: variant.options.map((o) => string(o, 80)), price: importMoney(variant.price), inventory: stock(variant.inventory) }; });
  const colorImages: Record<string, string> = {};
  for (const [key, value] of Object.entries(record(v.colorImages)).slice(0, 10)) if (key && value) colorImages[key.slice(0, 80)] = url(value);
  return { sourceUrl, name: string(v.name, 200), description: sanitizeProductDescription(string(v.description, 30_000), sourceUrl), images: [...new Set(v.images.map(url))], price: importMoney(v.price), originalPrice: importMoney(v.originalPrice), currency: string(v.currency, 8), specs, variants, inventory: stock(v.inventory), category: string(v.category, 100), colorImages, warnings: [], reviewRequired: v.reviewRequired === true };
}

export function importedProductId(shop: Pick<Shop, 'id' | 'slug'>, sourceUrl: string): string {
  return `${shop.slug}-imp-${createHash('sha256').update(`${shop.id}:${canonicalProductUrl(sourceUrl)}`).digest('hex').slice(0, 24)}`;
}

export async function applyImportedProduct(db: SupabaseClient, shop: Shop, input: unknown, settings: { stock?: unknown; reviewed?: unknown; publish?: unknown; category?: unknown }, handler: string) {
  const product = validateImportedProduct(input);
  const defaultStock = stock(settings.stock);
  const problems = importProblems(product, defaultStock, settings.reviewed === true);
  if (problems.length) throw new Error(problems.join('；'));
  const id = importedProductId(shop, product.sourceUrl);
  const existing = await db.from('products').select('*').eq('id', id).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { status: 'duplicate' as const, product: existing.data as Product, warnings: [] as string[] };
  const category = string(settings.category, 100);
  if (category) { const found = await db.from('categories').select('slug').eq('slug', category).maybeSingle(); if (found.error || !found.data) throw new Error('目的商品分類不存在或不屬於這家店'); }
  const variants = product.variants.map((v) => ({ options: v.options, price: v.price!, inventory: v.inventory ?? defaultStock! }));
  const inventory = variants.length ? variants.reduce((sum, v) => sum + v.inventory, 0) : product.inventory ?? defaultStock!;
  if (settings.publish === true && inventory <= 0) throw new Error('庫存為 0 的商品不會顯示，請設定庫存或選擇存為未上架');
  const allImages = [...new Set([...product.images, ...descriptionImageUrls(product.description), ...Object.values(product.colorImages)])];
  if (allImages.length > 30) throw new Error('商品與介紹圖片合計超過 30 張，請減少圖片後再匯入');
  const prefix = `products/import/${shop.id}/${id}/${randomUUID()}`;
  const uploaded: string[] = [];
  const stored = new Map<string, string>();
  const start = Date.now();
  let committed = false;
  try {
    // Bound both image memory and fetch time; no product row is written until every image is stored.
    for (let index = 0; index < allImages.length; index += 2) {
      if (Date.now() - start > 75_000) throw new Error('圖片搬移逾時，請稍後重試或減少圖片');
      const results = await Promise.allSettled(allImages.slice(index, index + 2).map(async (source) => {
        const fetched = await fetchPublic(source, 5 * 1024 * 1024);
        if (!fetched.res.ok) throw new Error('商品圖片讀取失敗，尚未上架');
        const bytes = new Uint8Array(await fetched.res.arrayBuffer());
        const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: 'warning' });
        const info = await image.metadata();
        if (!['jpeg', 'png', 'webp', 'gif', 'heif', 'avif'].includes(info.format ?? '')) throw new Error('來源圖片格式不安全或無法辨識');
        const output = await image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).timeout({ seconds: 10 }).toBuffer();
        if (output.length > 5 * 1024 * 1024) throw new Error('商品圖片過大');
        const path = `${prefix}/${createHash('sha256').update(source).digest('hex').slice(0, 20)}.webp`;
        const result = await db.storage.from('assets').upload(path, output, { contentType: 'image/webp', upsert: false });
        if (result.error) throw new Error(result.error.message);
        uploaded.push(path);
        stored.set(source, db.storage.from('assets').getPublicUrl(path).data.publicUrl);
      }));
      const failed = results.find((r) => r.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    }
    const images = product.images.map((src) => stored.get(src)!);
    const data = {
      id, name: product.name, tagline: replaceDescriptionImages(product.description, stored), price: product.price!, original_price: product.originalPrice,
      inventory, status: settings.publish === true ? '上架中' : '已下架', category, image: images[0], images,
      specs: product.specs, variants, colors: product.specs.find((s) => /顏色|color/i.test(s.name))?.options ?? [], sizes: product.specs.find((s) => /尺寸|size/i.test(s.name))?.options ?? [],
      color_images: Object.fromEntries(Object.entries(product.colorImages).map(([key, src]) => [key, stored.get(src)!])),
      unit: '', sale_mode: '現貨', is_featured: false, sort_order: 0, campaign_id: null,
      available_payment_methods: [], available_shipping_methods: [], shipping_fee_overrides: {},
    };
    const inserted = await db.from('products').insert(data).select().single();
    if (inserted.error?.code === '23505') {
      const found = await db.from('products').select('*').eq('id', id).maybeSingle();
      if (found.data) return { status: 'duplicate' as const, product: found.data as Product, warnings: [] as string[] };
    }
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? '商品儲存失敗');
    committed = true;
    const warnings: string[] = [];
    const movements = variants.length ? variants.filter((v) => v.inventory > 0).map((v) => ({ product_id: id, variant_key: v.options.join(' / '), type: 'in', quantity: v.inventory, unit_price: 0, handler, location: '', note: '商品一鍵搬家：初始庫存' })) : inventory > 0 ? [{ product_id: id, variant_key: '', type: 'in', quantity: inventory, unit_price: 0, handler, location: '', note: '商品一鍵搬家：初始庫存' }] : [];
    if (movements.length) { try { const journal = await db.from('stock_movements').insert(movements); if (journal.error) warnings.push('商品已建立，但初始庫存紀錄寫入失敗，請至庫存管理核對'); } catch { warnings.push('商品已建立，但初始庫存紀錄寫入失敗，請至庫存管理核對'); } }
    return { status: 'created' as const, product: inserted.data as Product, warnings };
  } finally {
    if (!committed && uploaded.length) await db.storage.from('assets').remove(uploaded).catch(() => {});
  }
}
