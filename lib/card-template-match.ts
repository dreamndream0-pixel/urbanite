import { CARD_TEMPLATES, isDarkColor, THEME_CONTENT_KEYS, type CardTheme } from '@/lib/profile-card';
import type { ImportedStyle } from '@/lib/card-import';

// 顏色字串 → RGB(#rgb、#rrggbb、rgb()/rgba());看不懂就回傳 null
function rgb(color: string | undefined): [number, number, number] | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();
  let m = c.match(/^#?([0-9a-f]{3})$/);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = c.match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

// 兩個顏色的差距 0(一樣)~ 1(黑白);任一邊看不懂就不計分
function distance(a: string | undefined, b: string | undefined) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return null;
  // 人眼對綠色較敏感:加權歐氏距離
  const d = Math.sqrt(2 * (x[0] - y[0]) ** 2 + 4 * (x[1] - y[1]) ** 2 + 3 * (x[2] - y[2]) ** 2);
  return d / Math.sqrt(9 * 255 ** 2);
}

// 彩度 0(灰)~ 1(鮮豔):灰色頁面不要配到暖色模板
function chroma(c: string | undefined) {
  const v = rgb(c);
  return v ? (Math.max(...v) - Math.min(...v)) / 255 : null;
}

const hexOf = (c: string | undefined) => {
  const v = rgb(c);
  return v ? `#${v.map((n) => n.toString(16).padStart(2, '0')).join('')}` : '';
};

// 依原本頁面的配色與按鈕樣式,挑最接近的模板;allowed 可限制只能用哪些(例如免費版)
export function matchTemplate(style: ImportedStyle | undefined, allowed: (key: string) => boolean = () => true): string {
  if (!style || !(rgb(style.bg) || rgb(style.button) || rgb(style.text))) return '';
  const dark = style.dark ?? (rgb(style.bg) ? isDarkColor(hexOf(style.bg)) : undefined);
  let best = '';
  let bestScore = Infinity;
  for (const t of CARD_TEMPLATES) {
    if (t.key === 'blank' || !allowed(t.key)) continue;
    const th = t.theme;
    let score = 0;
    let weight = 0;
    const add = (d: number | null, w: number) => {
      if (d === null) return;
      score += d * w;
      weight += w;
    };
    add(distance(style.bg, th.bgColor), 4);
    add(distance(style.bg2, th.bgType === 'gradient' ? th.bgColor2 : th.bgColor), 1);
    add(distance(style.text, th.textColor), 2);
    // 外框按鈕:按鈕本身是白 / 透明,顏色看外框與文字
    if (style.fill === 'outline') add(distance(style.buttonText || style.button, th.buttonColor), 1);
    else {
      add(distance(style.button, th.buttonColor), 1);
      add(distance(style.buttonText, th.buttonTextColor), 0.5);
    }
    const c1 = chroma(style.bg);
    const c2 = chroma(th.bgColor);
    if (c1 !== null && c2 !== null) add(Math.abs(c1 - c2), 2);
    let total = weight ? score / weight : 1;
    if (dark !== undefined && dark !== isDarkColor(th.bgColor ?? '#ffffff')) total += 0.5; // 深淺色不同差很多
    if (style.shape && style.shape !== th.buttonShape) total += 0.04;
    if (style.fill && style.fill !== th.buttonFill) total += 0.04;
    if (Boolean(style.bg2) !== (th.bgType === 'gradient')) total += 0.03;
    if (total < bestScore) {
      bestScore = total;
      best = t.key;
    }
  }
  return best;
}

// 套用模板:樣式換成模板的,使用者自己上傳的內容(封面、背景圖…)保留
export function templateTheme(key: string, current: Partial<CardTheme> = {}): Partial<CardTheme> | null {
  const t = CARD_TEMPLATES.find((x) => x.key === key);
  if (!t) return null;
  const keep: Partial<CardTheme> = {};
  for (const k of THEME_CONTENT_KEYS) if (current[k] !== undefined) (keep as Record<string, unknown>)[k] = current[k];
  return { ...t.theme, template: t.key, ...keep };
}
