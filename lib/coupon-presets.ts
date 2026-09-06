import type { CSSProperties } from 'react';

export type CouponPreset = { key: string; label: string; color: string; dark?: boolean };

// 優惠券左側樣式:10 種單色布樣(品牌大地色系)。想要照片請用「上傳照片」。
export const COUPON_PRESETS: CouponPreset[] = [
  { key: 'preset-1', label: '燕麥', color: '#ded3c0' },
  { key: 'preset-2', label: '米白', color: '#efe7da' },
  { key: 'preset-3', label: '暖沙', color: '#d8b98f' },
  { key: 'preset-4', label: '灰玫', color: '#c9a7a3' },
  { key: 'preset-5', label: '奶茶', color: '#c8a98c' },
  { key: 'preset-6', label: '橄欖', color: '#a7a77d', dark: true },
  { key: 'preset-7', label: '霧藍', color: '#9fb2b8', dark: true },
  { key: 'preset-8', label: '磚紅', color: '#b0654e', dark: true },
  { key: 'preset-9', label: '可可', color: '#8f6f57', dark: true },
  { key: 'preset-10', label: '墨黑', color: '#2a2624', dark: true },
];

// 券上的手寫小標(裝飾),依 code 穩定挑選
export const COUPON_SCRIPTS = [
  'For a better you.',
  'Good Style, Good Day.',
  'Wear Your Story.',
  'Brighter Days.',
  'Dress Your Mood.',
  'Make it Yours.',
];

function hash(code: string): number {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function presetOf(image?: string, code = ''): CouponPreset {
  return COUPON_PRESETS.find((p) => p.key === image) ?? COUPON_PRESETS[hash(code) % COUPON_PRESETS.length];
}

export function isUploadedImage(image?: string): boolean {
  return Boolean(image && /^https?:\/\//.test(image));
}

// 左側圖樣式:上傳照片用照片;否則用預設單色。
export function couponImageStyle(image?: string, code = ''): CSSProperties {
  if (isUploadedImage(image)) {
    return { backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { backgroundColor: presetOf(image, code).color };
}

// 左側圖上的直排小字顏色(深色底用白字)
export function couponImageIsDark(image?: string, code = ''): boolean {
  if (isUploadedImage(image)) return true;
  return Boolean(presetOf(image, code).dark);
}

export function couponScript(code = ''): string {
  return COUPON_SCRIPTS[hash(code) % COUPON_SCRIPTS.length];
}
