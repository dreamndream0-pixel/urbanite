// 後台預覽用:把網站資料轉成卡片模板的資料(連結用 #,預覽不會點)
import {
  couponBubble,
  couponValueText,
  defaultCouponStyle,
  memberBubble,
  productBubble,
  SAMPLE_COUPON,
  SAMPLE_LINKS,
  SAMPLE_MEMBER,
  SAMPLE_PRODUCT,
  type CouponData,
  type ProductData,
} from '@/lib/line-flex-templates';
import type { Discount, Product } from '@/lib/types';

const abs = (u: string) => (u && u.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${u}` : u);

export function productData(p?: Product): ProductData {
  if (!p) return { ...SAMPLE_PRODUCT, image: '' };
  return { name: p.name, subtitle: p.tagline || '', price: p.price, originalPrice: p.original_price, image: abs(p.image || p.images?.[0] || ''), url: '#' };
}

export function couponData(c?: Discount): CouponData {
  if (!c) return SAMPLE_COUPON;
  return {
    name: c.name || c.code,
    valueText: couponValueText(c),
    condition: c.min_spend ? `滿 NT$${c.min_spend.toLocaleString('en-US')} 可用` : '無消費門檻',
    code: c.code,
    expiry: c.end_at ? new Date(c.end_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '',
    claimUrl: '#',
    shopUrl: '#',
  };
}

export const productCard = (style: string, p?: Product) => productBubble(style, productData(p));
export const couponCard = (style: string, c?: Discount) => couponBubble(style || defaultCouponStyle(c?.type ?? 'amount'), couponData(c));
export const memberCard = (style: string, shopName?: string) => memberBubble(style, { ...SAMPLE_MEMBER, shopName: shopName || SAMPLE_MEMBER.shopName }, SAMPLE_LINKS);
