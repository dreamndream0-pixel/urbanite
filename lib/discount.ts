import type { Discount, OrderItem, Product } from './types';

export type CouponValidationContext = {
  subtotal: number;
  shipping?: number;
  items?: OrderItem[];
  products?: Product[];
  userId?: string | null;
  isFirstPurchase?: boolean;
  totalUsageCount?: number;
  userUsageCount?: number;
  userCouponStatus?: string | null;
  now?: Date;
};

export type CouponValidationResult = {
  ok: boolean;
  reason?: string;
  discount: number;
  shippingDiscount: number;
  finalCouponAmount: number;
  label: string;
};

const activeStatuses = new Set(['啟用', 'active']);

export function discountLabel(d: Discount): string {
  if (d.type === 'free_shipping') return '免運';
  if (d.type === 'amount') return `折抵 NT$${d.value}`;
  const off = Math.max(0, 100 - Number(d.value || 0));
  return `${off} 折`;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function isCouponActive(d: Discount, now: Date): string | null {
  if (!d.active || (d.status && !activeStatuses.has(d.status))) return '優惠券尚未啟用';
  if (d.start_at && new Date(d.start_at) > now) return '優惠券尚未開始';
  if (d.end_at && new Date(d.end_at) < now) return '優惠券已過期';
  return null;
}

function hasApplicableItem(d: Discount, products: Product[], items: OrderItem[]): boolean {
  const ids = new Set(asStringArray(d.applicable_products));
  const cats = new Set(asStringArray(d.applicable_categories));
  if (ids.size === 0 && cats.size === 0) return true;
  const byId = new Map(products.map((product) => [product.id, product]));
  return items.some((item) => {
    if (ids.has(String(item.productId))) return true;
    const product = byId.get(String(item.productId));
    return product ? cats.has(product.category) : false;
  });
}

export function evaluateCoupon(d: Discount, context: CouponValidationContext): CouponValidationResult {
  const now = context.now ?? new Date();
  const subtotal = Math.max(0, Math.floor(Number(context.subtotal) || 0));
  const shipping = Math.max(0, Math.floor(Number(context.shipping) || 0));
  const label = discountLabel(d);
  const inactiveReason = isCouponActive(d, now);

  if (inactiveReason) return { ok: false, reason: inactiveReason, discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  if (context.userCouponStatus && context.userCouponStatus !== 'available') {
    return { ok: false, reason: '這張會員優惠券不可使用', discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  }
  if (subtotal < Number(d.min_spend || 0)) {
    return {
      ok: false,
      reason: `未滿 NT$${Number(d.min_spend || 0).toLocaleString('zh-TW')}`,
      discount: 0,
      shippingDiscount: 0,
      finalCouponAmount: 0,
      label,
    };
  }
  if ((d.applicable_users === 'new' || d.is_first_purchase_only) && !context.isFirstPurchase) {
    return { ok: false, reason: '僅限新會員首購使用', discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  }
  if (d.applicable_users === 'vip') {
    return { ok: false, reason: '僅限 VIP 會員使用', discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  }
  if (!hasApplicableItem(d, context.products ?? [], context.items ?? [])) {
    return { ok: false, reason: '僅限指定商品或分類使用', discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  }
  if (d.total_limit && (context.totalUsageCount ?? 0) >= d.total_limit) {
    return { ok: false, reason: '優惠券已達總使用上限', discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  }
  if (d.per_user_limit && context.userId && (context.userUsageCount ?? 0) >= d.per_user_limit) {
    return { ok: false, reason: '已達每位會員使用上限', discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  }

  let itemDiscount = 0;
  let shippingDiscount = 0;
  if (d.type === 'free_shipping') {
    shippingDiscount = shipping;
  } else if (d.type === 'amount') {
    itemDiscount = Math.min(Number(d.value) || 0, subtotal);
  } else {
    itemDiscount = Math.round(subtotal * ((Number(d.value) || 0) / 100));
    if (d.max_discount) itemDiscount = Math.min(itemDiscount, d.max_discount);
  }
  const finalCouponAmount = Math.max(0, Math.min(subtotal + shipping, itemDiscount + shippingDiscount));
  if (finalCouponAmount <= 0) {
    return { ok: false, reason: '此訂單目前沒有可折抵金額', discount: 0, shippingDiscount: 0, finalCouponAmount: 0, label };
  }
  return { ok: true, discount: itemDiscount, shippingDiscount, finalCouponAmount, label };
}

// 舊程式仍可用的簡化計算。
export function calcDiscount(d: Discount, subtotal: number): number {
  return evaluateCoupon(d, { subtotal }).discount;
}
