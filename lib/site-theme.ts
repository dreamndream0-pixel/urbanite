// 網站外觀(前台):配色與版面配置。存在 site_settings.site_theme,由根版面輸出成 CSS 變數

export type ColorKey =
  | 'bg' | 'header' | 'surface' | 'card' | 'text' | 'text2' | 'muted' | 'border' | 'borderStrong'
  | 'soft' | 'brand' | 'sale' | 'gold' | 'button' | 'buttonText';

// 每個顏色對應一個 CSS 變數(前台元件用 bg-[var(--c-bg)] 等方式取用)
export const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'bg', label: '頁面背景', hint: '整個網站的底色' },
  { key: 'header', label: '頁首 / 區塊底色', hint: '頁首、頁尾、分類列' },
  { key: 'surface', label: '面板底色', hint: '彈窗、表單、購物車' },
  { key: 'card', label: '商品卡底色', hint: '首頁商品卡' },
  { key: 'text', label: '主要文字', hint: '標題、內文' },
  { key: 'text2', label: '次要文字', hint: '說明、選單' },
  { key: 'muted', label: '提示文字', hint: '輔助說明、原價' },
  { key: 'border', label: '邊框線', hint: '分隔線、卡片外框' },
  { key: 'borderStrong', label: '按鈕外框', hint: '外框按鈕、輸入框' },
  { key: 'soft', label: '淡色底', hint: '滑過、選取狀態' },
  { key: 'brand', label: '品牌主色', hint: '選取分類、收藏' },
  { key: 'sale', label: '強調色', hint: '特價、提醒' },
  { key: 'gold', label: '點綴色', hint: '會員、優惠標示' },
  { key: 'button', label: '按鈕底色', hint: '加入購物車、結帳' },
  { key: 'buttonText', label: '按鈕文字', hint: '按鈕上的文字' },
];

export const cssVar = (key: ColorKey) => `--c-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;

export type CardStyle = 'soft' | 'plain' | 'bordered' | 'elevated';
export type GridColumns = '2-4' | '2-3' | '1-3';
export type RadiusStyle = 'square' | 'soft' | 'round';
export type HeadingFont = 'sans' | 'serif';

export type SiteLayout = { card: CardStyle; columns: GridColumns; radius: RadiusStyle; heading: HeadingFont };

export const LAYOUT_OPTIONS = {
  card: [
    { key: 'soft', label: '淡底卡片' },
    { key: 'plain', label: '無框' },
    { key: 'bordered', label: '細框' },
    { key: 'elevated', label: '浮起陰影' },
  ] as { key: CardStyle; label: string }[],
  columns: [
    { key: '2-4', label: '手機 2 欄 / 電腦 4 欄' },
    { key: '2-3', label: '手機 2 欄 / 電腦 3 欄' },
    { key: '1-3', label: '手機 1 欄 / 電腦 3 欄' },
  ] as { key: GridColumns; label: string }[],
  radius: [
    { key: 'square', label: '直角' },
    { key: 'soft', label: '小圓角' },
    { key: 'round', label: '大圓角' },
  ] as { key: RadiusStyle; label: string }[],
  heading: [
    { key: 'sans', label: '黑體' },
    { key: 'serif', label: '明體' },
  ] as { key: HeadingFont; label: string }[],
};

export type SiteTheme = { template: string; colors: Record<ColorKey, string>; layout: SiteLayout };

export const DEFAULT_COLORS: Record<ColorKey, string> = {
  bg: '#f6f2ec',
  header: '#faf7f2',
  surface: '#ffffff',
  card: '#f9f8f6',
  text: '#1f1b19',
  text2: '#6b6156',
  muted: '#8a7f72',
  border: '#e5ded4',
  borderStrong: '#d7c9bd',
  soft: '#efe8dd',
  brand: '#702838',
  sale: '#c84767',
  gold: '#ada265',
  button: '#1f1b19',
  buttonText: '#ffffff',
};

export const DEFAULT_LAYOUT: SiteLayout = { card: 'soft', columns: '2-4', radius: 'soft', heading: 'sans' };

export const SITE_TEMPLATES: { key: string; name: string; note: string; colors: Record<ColorKey, string>; layout: SiteLayout }[] = [
  { key: 'urbanite', name: '經典米白', note: '淡底卡片・4 欄・黑體', colors: DEFAULT_COLORS, layout: DEFAULT_LAYOUT },
  {
    key: 'mono',
    name: '極簡純白',
    note: '無框・3 欄・直角',
    colors: { bg: '#ffffff', header: '#ffffff', surface: '#ffffff', card: '#ffffff', text: '#111111', text2: '#444444', muted: '#8a8a8a', border: '#e6e6e6', borderStrong: '#cfcfcf', soft: '#f2f2f2', brand: '#111111', sale: '#d0021b', gold: '#a8956a', button: '#111111', buttonText: '#ffffff' },
    layout: { card: 'plain', columns: '2-3', radius: 'square', heading: 'sans' },
  },
  {
    key: 'burgundy',
    name: '酒紅復古',
    note: '細框・4 欄・明體',
    colors: { bg: '#f4ece6', header: '#f9f2ec', surface: '#fffaf6', card: '#fffaf6', text: '#3a1820', text2: '#6a4a50', muted: '#9a7d82', border: '#e8d6d2', borderStrong: '#d4b8b6', soft: '#f1e2de', brand: '#702838', sale: '#a8233a', gold: '#b08d57', button: '#702838', buttonText: '#ffffff' },
    layout: { card: 'bordered', columns: '2-4', radius: 'soft', heading: 'serif' },
  },
  {
    key: 'forest',
    name: '森林綠',
    note: '浮起陰影・3 欄・大圓角',
    colors: { bg: '#eef1ea', header: '#f6f8f3', surface: '#ffffff', card: '#ffffff', text: '#233024', text2: '#4d5c4b', muted: '#7d8a7a', border: '#dbe2d5', borderStrong: '#c2cdbb', soft: '#e4eadf', brand: '#414a33', sale: '#c0603a', gold: '#a89b5c', button: '#414a33', buttonText: '#ffffff' },
    layout: { card: 'elevated', columns: '2-3', radius: 'round', heading: 'serif' },
  },
  {
    key: 'midnight',
    name: '午夜深色',
    note: '細框・4 欄・小圓角',
    colors: { bg: '#121417', header: '#1a1d21', surface: '#1f2328', card: '#1f2328', text: '#f1f1f1', text2: '#c8c8c8', muted: '#8f949a', border: '#2e3238', borderStrong: '#41464e', soft: '#262a30', brand: '#e0b872', sale: '#ff6b81', gold: '#e0b872', button: '#e0b872', buttonText: '#121417' },
    layout: { card: 'bordered', columns: '2-4', radius: 'soft', heading: 'sans' },
  },
  {
    key: 'blush',
    name: '奶茶粉',
    note: '無框・手機 1 欄・大圓角',
    colors: { bg: '#fbf1ef', header: '#fff7f5', surface: '#ffffff', card: '#ffffff', text: '#4a2f35', text2: '#7a5a60', muted: '#a88a8f', border: '#f0dcd8', borderStrong: '#e4c4bf', soft: '#f8e6e2', brand: '#c8677a', sale: '#d6455d', gold: '#c9a27e', button: '#c8677a', buttonText: '#ffffff' },
    layout: { card: 'plain', columns: '1-3', radius: 'round', heading: 'sans' },
  },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function resolveSiteTheme(raw: unknown): SiteTheme {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Partial<SiteTheme>;
  const colors = { ...DEFAULT_COLORS };
  for (const f of COLOR_FIELDS) {
    const v = t.colors?.[f.key];
    if (typeof v === 'string' && HEX.test(v)) colors[f.key] = v.toLowerCase();
  }
  const l = (t.layout ?? {}) as Partial<SiteLayout>;
  const pick = <T extends string>(v: unknown, list: { key: T }[], fallback: T) => (list.some((o) => o.key === v) ? (v as T) : fallback);
  return {
    template: typeof t.template === 'string' ? t.template : 'urbanite',
    colors,
    layout: {
      card: pick(l.card, LAYOUT_OPTIONS.card, DEFAULT_LAYOUT.card),
      columns: pick(l.columns, LAYOUT_OPTIONS.columns, DEFAULT_LAYOUT.columns),
      radius: pick(l.radius, LAYOUT_OPTIONS.radius, DEFAULT_LAYOUT.radius),
      heading: pick(l.heading, LAYOUT_OPTIONS.heading, DEFAULT_LAYOUT.heading),
    },
  };
}

// 輸出到 <style> 的 CSS 變數
export function siteThemeCss(theme: SiteTheme) {
  const vars = COLOR_FIELDS.map((f) => `${cssVar(f.key)}:${theme.colors[f.key]};`).join('');
  // 深色頁首:深色 Logo 自動反白
  const logo = isDarkColor(theme.colors.header) ? '.site-logo{filter:invert(1) hue-rotate(180deg);}' : '';
  return `:root{${vars}}${logo}`;
}

function isDarkColor(hex: string) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}
