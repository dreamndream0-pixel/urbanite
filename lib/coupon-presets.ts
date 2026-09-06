import type { CSSProperties } from 'react';

export type CouponPreset = { key: string; label: string; bg: string };

// 優惠券左側圖的 10 種預設樣式(品牌大地色系漸層)
export const COUPON_PRESETS: CouponPreset[] = [
  { key: 'preset-1', label: '燕麥', bg: 'linear-gradient(135deg,#ece4d6 0%,#cdbfa6 100%)' },
  { key: 'preset-2', label: '奶茶', bg: 'linear-gradient(135deg,#e6d7c5 0%,#c8a98c 100%)' },
  { key: 'preset-3', label: '灰玫', bg: 'linear-gradient(135deg,#e8dbd8 0%,#c9a7a3 100%)' },
  { key: 'preset-4', label: '橄欖', bg: 'linear-gradient(135deg,#dedec9 0%,#a7a77d 100%)' },
  { key: 'preset-5', label: '霧藍', bg: 'linear-gradient(135deg,#d6dee1 0%,#9fb2b8 100%)' },
  { key: 'preset-6', label: '暖沙', bg: 'linear-gradient(135deg,#f0e4d3 0%,#d8b98f 100%)' },
  { key: 'preset-7', label: '可可', bg: 'linear-gradient(135deg,#d3bda8 0%,#8f6f57 100%)' },
  { key: 'preset-8', label: '墨黑', bg: 'linear-gradient(135deg,#585149 0%,#25211e 100%)' },
  { key: 'preset-9', label: '米白', bg: 'linear-gradient(135deg,#f5f0e8 0%,#ddd1be 100%)' },
  { key: 'preset-10', label: '磚紅', bg: 'linear-gradient(135deg,#e2c6b6 0%,#b0654e 100%)' },
];

// 券上的手寫小標(裝飾),依 code 穩定挑選
export const COUPON_SCRIPTS = ['For a better you.', 'Good Style, Good Day.', 'Wear Your Story.', 'Brighter Days.', 'Dress Your Mood.', 'Make it Yours.'];

function hash(code: string): number {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// 由 image 值算出左側圖樣式:https 開頭 = 上傳照片;preset-N = 預設漸層;
// 空值 = 依 code 雜湊挑一個預設,讓每張券都有穩定又好看的底圖。
export function couponImageStyle(image?: string, code = ''): CSSProperties {
  if (image && /^https?:\/\//.test(image)) {
    return { backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  const preset = COUPON_PRESETS.find((p) => p.key === image) ?? COUPON_PRESETS[hash(code) % COUPON_PRESETS.length];
  return { backgroundImage: preset.bg };
}

export function couponScript(code = ''): string {
  return COUPON_SCRIPTS[hash(code) % COUPON_SCRIPTS.length];
}

// 上傳照片為深色時字用白色:預設 preset-8(墨黑)、preset-7(可可)、preset-10(磚紅)偏深
export function couponImageIsDark(image?: string): boolean {
  return image === 'preset-8' || image === 'preset-7' || image === 'preset-10';
}
