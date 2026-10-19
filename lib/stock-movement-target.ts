import type { Product } from './types';

type StockProduct = Pick<Product, 'id' | 'name' | 'specs' | 'variants'>;
type StockTarget = { ok: true; variantKey: string; variantIndex: number | null } | { ok: false; error: string };

// Match the product first, then one complete variant. Never choose the first partial match.
export function resolveStockMovementTarget(product: StockProduct | null | undefined, key = ''): StockTarget {
  if (!product?.id) return { ok: false, error: '找不到品項，請重新選擇商品' };
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const specs = (Array.isArray(product.specs) ? product.specs : []).filter((s) => s.options?.length);
  if (!variants.length) {
    if (key) return { ok: false, error: `${product.name} 沒有此規格，請重新選擇品項` };
    if (specs.length) return { ok: false, error: `${product.name} 尚未建立規格庫存組合，請先確認商品設定` };
    return { ok: true, variantKey: '', variantIndex: null };
  }
  if (variants.some((v) => !v || !Array.isArray(v.options) || v.options.some((o) => typeof o !== 'string') || (specs.length > 0 && v.options.length !== specs.length))) {
    return { ok: false, error: `${product.name} 的規格資料不完整，請先確認商品設定` };
  }
  if (!key && variants.length > 1) return { ok: false, error: `請選擇 ${product.name} 的完整規格 / 尺寸` };
  const matches = variants.map((v, index) => ({ key: v.options.join(' / '), index })).filter((v) => key ? v.key === key : true);
  if (matches.length !== 1) return { ok: false, error: `${product.name} 無法唯一比對到規格，請重新選擇品項` };
  return { ok: true, variantKey: matches[0].key, variantIndex: matches[0].index };
}
