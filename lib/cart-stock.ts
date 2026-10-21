import type { Product } from './types';

type StockItem = { productId: string; variant: string; quantity: number };
type StockProduct = Pick<Product, 'id' | 'inventory' | 'variants' | 'status'>;

// Match the order API: even preorder quantities need available stock.
export function stockOf(product: StockProduct | undefined, variant: string): number {
  if (!product || product.status === '已下架' || /售完|完售|sold\s*out/i.test(product.status || '')) return 0;
  const variants = product.variants ?? [];
  const matches = variants.filter((entry) => entry.options.join(' / ') === variant);
  const stock = variants.length ? (matches.length === 1 ? matches[0].inventory : 0) : product.inventory;
  return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;
}

export function remainingStock(product: StockProduct | undefined, variant: string, cart: readonly StockItem[]): number {
  const used = cart.reduce((sum, item) => sum + (
    item.productId === product?.id && (!product.variants?.length || item.variant === variant)
      ? Math.max(0, item.quantity) : 0
  ), 0);
  return Math.max(0, stockOf(product, variant) - used);
}

export function cartItemLimit<T extends StockItem>(item: T, cart: readonly T[], product: StockProduct | undefined): number {
  return remainingStock(product, item.variant, cart.filter((entry) => entry !== item));
}
