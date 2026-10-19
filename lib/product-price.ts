import type { Product, Variant } from './types';

type PricedProduct = Pick<Product, 'price' | 'variants'>;

export function isValidPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

export function variantPrice(product: Pick<Product, 'price'>, variant?: Pick<Variant, 'price'> | null): number {
  return variant?.price ?? product.price;
}

export function productPrice(product: PricedProduct, label: string): number {
  const variant = product.variants?.find((v) => v.options.join(' / ') === label)
    ?? (label === '標準款' ? product.variants?.find((v) => v.options.length === 0) : undefined);
  return variantPrice(product, variant);
}

export function formatProductPrice(product: PricedProduct, format: (price: number) => string): string {
  const prices = product.variants?.length ? product.variants.map((v) => variantPrice(product, v)) : [product.price];
  const min = Math.min(...prices);
  return `${format(min)}${prices.some((p) => p !== min) ? ' 起' : ''}`;
}

// Reject malformed prices before they reach the JSON variants column.
export function productPriceError(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '商品資料格式錯誤';
  const body = input as { price?: unknown; variants?: unknown };
  if ('price' in body && !isValidPrice(body.price)) return '商品售價必須是大於或等於 0 的有效金額';
  if ('variants' in body) {
    if (!Array.isArray(body.variants)) return '商品規格格式錯誤';
    for (const variant of body.variants) {
      if (!variant || !Array.isArray(variant.options) || !variant.options.every((v: unknown) => typeof v === 'string')) return '商品規格格式錯誤';
      if (variant.price != null && !isValidPrice(variant.price)) return '規格售價必須是大於或等於 0 的有效金額，或留空沿用基本售價';
    }
  }
  return null;
}

export function repriceCart<T extends { productId: string; variant: string; price: number }>(items: T[], products: Product[]): T[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((item) => {
    const product = byId.get(item.productId);
    return product ? { ...item, price: productPrice(product, item.variant) } : item;
  });
}
