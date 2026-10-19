import type { SpecDim } from './types';

export type ImportVariant = { options: string[]; price: number | null; inventory: number | null };
export type ImportedProduct = {
  sourceUrl: string; name: string; description: string; images: string[];
  price: number | null; originalPrice: number | null; currency: string;
  specs: SpecDim[]; variants: ImportVariant[]; inventory: number | null;
  category: string; colorImages: Record<string, string>; warnings: string[]; reviewRequired: boolean;
};
export type DiscoveryTask = { url: string; offset: number };
export type ProductDiscovery = { url: string; root: string; products: string[]; pages: string[]; nextOffset: number | null; warnings: string[] };
export const IMPORT_PAGE_SIZE = 200;
export const IMPORT_MAX_VARIANTS = 200;

export function importProblems(product: ImportedProduct, stock: number | null, reviewed: boolean): string[] {
  const problems: string[] = [];
  if (!product.name.trim()) problems.push('缺少商品名稱');
  if (!product.images.length) problems.push('缺少商品照片');
  if (product.currency !== 'TWD') problems.push('請確認並換算新臺幣售價');
  const money = (n: number | null) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1_000_000_000;
  if (!money(product.price)) problems.push('請填寫商品售價');
  if (product.specs.length && !product.variants.length) problems.push('規格組合尚未完整');
  const keys = new Set<string>();
  for (const variant of product.variants) {
    const key = variant.options.join(' / ');
    if (keys.has(key) || variant.options.length !== product.specs.length || variant.options.some((v, i) => !product.specs[i].options.includes(v))) problems.push('規格組合不完整或重複');
    keys.add(key);
    if (!money(variant.price)) problems.push('部分規格缺少售價');
    const inventory = variant.inventory ?? stock;
    if (inventory === null || !Number.isSafeInteger(inventory) || inventory < 0 || inventory > 1_000_000) problems.push('請設定未公開的規格庫存');
  }
  if (!product.variants.length) {
    const inventory = product.inventory ?? stock;
    if (inventory === null || !Number.isSafeInteger(inventory) || inventory < 0 || inventory > 1_000_000) problems.push('請設定未公開的商品庫存');
  }
  if (product.reviewRequired && !reviewed) problems.push('請確認辨識結果');
  return [...new Set(problems)];
}
