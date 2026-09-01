import type { Discount } from './types';

// 依折扣碼與小計,算出折抵金額(不符條件回 0)
export function calcDiscount(d: Discount, subtotal: number): number {
  if (!d.active) return 0;
  if (subtotal < d.min_spend) return 0;
  if (d.type === 'amount') return Math.min(d.value, subtotal);
  // percent:value=10 表示折 10%
  const amount = Math.round(subtotal * (d.value / 100));
  return d.max_discount ? Math.min(amount, d.max_discount) : amount;
}
