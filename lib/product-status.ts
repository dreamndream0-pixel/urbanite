import type { Product } from '@/lib/types';

type StockFields = Pick<Product, 'status' | 'sale_mode' | 'inventory' | 'variants'> & { keep_when_sold_out?: boolean };

// 後台「未上架」狀態(資料庫值沿用 '已下架')
export const UNLISTED_STATUS = '已下架';

export function isPreorder(product: Pick<Product, 'sale_mode'>) {
  return (product.sale_mode || '').includes('預購');
}

// 是否售完:預購商品不會售完;有規格時全部規格都沒庫存才算售完
export function isProductSoldOut(product: StockFields) {
  if (/售完|完售|sold\s*out/i.test(product.status || '')) return true;
  if (isPreorder(product)) return false;
  const variants = product.variants ?? [];
  if (variants.length > 0) return variants.every((variant) => (variant.inventory ?? 0) <= 0);
  return (product.inventory ?? 0) <= 0;
}

// 純現貨商品售完即自動下架(補貨後自動恢復);預購 / 預購+現貨售完仍繼續顯示
// 勾了「完售不下架」的商品:售完仍顯示在前台(標示已售完、不能購買)
export function isAutoDelisted(product: StockFields) {
  return !product.keep_when_sold_out && !isPreorder(product) && isProductSoldOut(product);
}

// 前台是否顯示
export function isVisibleInStore(product: StockFields) {
  return product.status !== UNLISTED_STATUS && !isAutoDelisted(product);
}

// 後台商品分類標籤
export type AdminProductTab = '上架中' | '未上架' | '已售完';
export const ADMIN_PRODUCT_TABS: AdminProductTab[] = ['上架中', '未上架', '已售完'];

export function adminProductTab(product: StockFields): AdminProductTab {
  if (product.status === UNLISTED_STATUS) return '未上架';
  // 完售不下架的商品也歸在「已售完」,方便看哪些要補貨
  if (!isPreorder(product) && isProductSoldOut(product)) return '已售完';
  return '上架中';
}
