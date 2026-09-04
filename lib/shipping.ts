// 運費規則(全站唯一來源)
// 前台購物車抽屜、結帳頁、後端下單一律呼叫這裡,確保所有入口的運費完全一致。
// 規則:
//   1. 小計為 0(空車)→ 不計運費
//   2. 購物車內任一商品設定「此商品免運」→ 免運
//   3. 小計達免運門檻 → 免運
//   4. 其餘 → 收取固定運費

export const FREE_SHIPPING_THRESHOLD = 2000; // 消費滿此金額免運
export const SHIPPING_FEE = 120;             // 未設定時的預設運費

type CartLike = { productId?: string };
type ProductLike = {
  id: string;
  available_shipping_methods?: string[] | null;
  shipping_fee_overrides?: Record<string, number> | null;
};
type SettingsLike = { shipping_fees?: { name: string; fee: number }[] | null };

// 取得某物流方式的「後台預設運費」
export function resolveMethodFee(settings: SettingsLike | null | undefined, method: string): number {
  const f = settings?.shipping_fees?.find((x) => x.name === method);
  return typeof f?.fee === 'number' ? f.fee : SHIPPING_FEE;
}

// 單一商品在某物流方式的運費:免運商品=0;商品有覆寫用覆寫;否則用該方式後台運費
export function productShippingFee(product: ProductLike | undefined, method: string, baseFee: number): number {
  if (!product) return baseFee;
  if (product.available_shipping_methods?.includes('免運')) return 0;
  const ov = product.shipping_fee_overrides?.[method];
  return typeof ov === 'number' ? ov : baseFee;
}

// 計算運費(單一規則來源)
// 規則:空車=0;滿門檻免運;否則以購物車內「需運費商品」的最高運費為準
//       (一免運一收費 → 以收費者為主;全部免運 → 0)
export function computeShipping(
  subtotal: number,
  cart: CartLike[],
  products: ProductLike[],
  method = '',
  baseFee: number = SHIPPING_FEE,
): number {
  if (subtotal <= 0) return 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  const fees = cart.map((item) => productShippingFee(products.find((p) => p.id === item.productId), method, baseFee));
  if (fees.length === 0) return baseFee;
  return Math.max(...fees);
}
