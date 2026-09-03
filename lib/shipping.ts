// 運費規則(全站唯一來源)
// 前台購物車抽屜、結帳頁、後端下單一律呼叫這裡,確保所有入口的運費完全一致。
// 規則:
//   1. 小計為 0(空車)→ 不計運費
//   2. 購物車內任一商品設定「此商品免運」→ 免運
//   3. 小計達免運門檻 → 免運
//   4. 其餘 → 收取固定運費

export const FREE_SHIPPING_THRESHOLD = 2000; // 消費滿此金額免運
export const SHIPPING_FEE = 120;             // 未達免運的固定運費

type CartLike = { productId?: string };
type ProductLike = { id: string; available_shipping_methods?: string[] | null };

// 購物車是否含有「此商品免運」的商品
export function hasFreeShippingItem(cart: CartLike[], products: ProductLike[]): boolean {
  return cart.some((item) => {
    const product = products.find((p) => p.id === item.productId);
    return !!product?.available_shipping_methods?.includes('免運');
  });
}

// 計算運費(單一規則來源)
export function computeShipping(subtotal: number, cart: CartLike[], products: ProductLike[]): number {
  if (subtotal <= 0) return 0;
  if (hasFreeShippingItem(cart, products)) return 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_FEE;
}
