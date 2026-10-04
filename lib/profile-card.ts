// 個人名片頁:前後台共用的型別與規則

export type SocialLink = { type: string; value: string };

// ---------- 外觀 ----------
export type ProfileLayout = 'classic' | 'hero' | 'card' | 'split' | 'magazine' | 'minimal';
export type LinkStyle = 'button' | 'left' | 'list' | 'card';

export const PROFILE_LAYOUTS: { key: ProfileLayout; label: string }[] = [
  { key: 'hero', label: '滿版封面' },
  { key: 'classic', label: '經典置中' },
  { key: 'card', label: '名片卡' },
  { key: 'split', label: '左右並排' },
  { key: 'magazine', label: '雜誌大圖' },
  { key: 'minimal', label: '極簡' },
];

export const LINK_STYLES: { key: LinkStyle; label: string }[] = [
  { key: 'button', label: '置中按鈕' },
  { key: 'left', label: '靠左按鈕' },
  { key: 'list', label: '清單' },
  { key: 'card', label: '圖卡' },
];

export type CardTheme = {
  template: string;
  layout: ProfileLayout; // 頁首版面配置
  linkStyle: LinkStyle; // 連結排列方式
  bgType: 'color' | 'image' | 'grid' | 'gradient' | 'dots' | 'stripes';
  bgColor: string;
  bgColor2: string; // 漸層第二色
  bgImage: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  avatarShape: 'circle' | 'square' | 'portrait';
  align: 'center' | 'left';
  buttonShape: 'pill' | 'rounded' | 'square';
  buttonFill: 'solid' | 'outline' | 'soft';
  buttonColor: string;
  buttonTextColor: string;
  buttonShadow: boolean;
  font: 'sans' | 'serif' | 'classic';
  headerBand: boolean; // 沒有封面照片時,最上方顯示色塊
  bandColor: string;
  // 以下為內容設定,套用樣板時不會被覆蓋
  coverImage: string;
  showAvatar: boolean;
};

export const DEFAULT_THEME: CardTheme = {
  template: 'ivory',
  layout: 'classic',
  linkStyle: 'button',
  bgType: 'color',
  bgColor: '#f6f2ec',
  bgColor2: '#ebe2d6',
  bgImage: '',
  textColor: '#1f1b19',
  mutedColor: '#6b6156',
  accentColor: '#702838',
  avatarShape: 'circle',
  align: 'center',
  buttonShape: 'pill',
  buttonFill: 'solid',
  buttonColor: '#1f1b19',
  buttonTextColor: '#ffffff',
  buttonShadow: false,
  font: 'sans',
  headerBand: false,
  bandColor: '#e5dccf',
  coverImage: '',
  showAvatar: true,
};

// 套用樣板時保留的欄位(使用者自己上傳的內容)
export const THEME_CONTENT_KEYS = ['coverImage', 'showAvatar', 'bgImage'] as const;

export type TemplateCategory = 'lively' | 'minimal' | 'dark';
export const TEMPLATE_CATEGORIES: { key: 'all' | TemplateCategory; label: string }[] = [
  { key: 'all', label: '最新' },
  { key: 'lively', label: '活潑' },
  { key: 'minimal', label: '簡約' },
  { key: 'dark', label: '深色' },
];

// 每個樣板都從同一組基礎樣式出發,切換樣板時不會殘留上一個樣板的設定
const STYLE_BASE: Omit<CardTheme, 'template' | (typeof THEME_CONTENT_KEYS)[number]> = {
  layout: 'classic', linkStyle: 'button', bgType: 'color', bgColor: '#f6f2ec', bgColor2: '#ebe2d6', textColor: '#1f1b19', mutedColor: '#6b6156', accentColor: '#702838',
  avatarShape: 'circle', align: 'center', buttonShape: 'pill', buttonFill: 'solid', buttonColor: '#1f1b19', buttonTextColor: '#ffffff',
  buttonShadow: false, font: 'sans', headerBand: false, bandColor: '#e5dccf',
};
const tpl = (key: string, name: string, category: TemplateCategory, theme: Partial<CardTheme>) => ({ key, name, category, theme: { ...STYLE_BASE, ...theme } });

// 預設樣板(新的排前面):版面配置 × 連結排列 × 配色,套用後仍可再微調
export const CARD_TEMPLATES: { key: string; name: string; category: TemplateCategory; theme: Partial<CardTheme> }[] = [
  // 滿版封面:封面照延伸到簡介,文字疊在照片上
  tpl('hero-sun', '滿版・暖陽', 'lively', { layout: 'hero', linkStyle: 'left', bgColor: '#fdf4e7', textColor: '#3a2a14', mutedColor: '#7a6448', accentColor: '#c46a00', buttonColor: '#ffc978', buttonTextColor: '#3a2a10', bandColor: '#5a4a3a' }),
  tpl('hero-noir', '滿版・黑夜', 'dark', { layout: 'hero', linkStyle: 'list', bgColor: '#111111', textColor: '#f2f2f2', mutedColor: '#9a9a9a', accentColor: '#ffffff', bandColor: '#2a2a2a', font: 'classic' }),
  tpl('hero-white', '滿版・純白', 'minimal', { layout: 'hero', linkStyle: 'card', bgColor: '#ffffff', textColor: '#1f1b19', mutedColor: '#6b6156', buttonColor: '#1f1b19', buttonShape: 'rounded', bandColor: '#8a8178' }),
  tpl('hero-rose', '滿版・玫瑰', 'lively', { layout: 'hero', linkStyle: 'button', bgColor: '#fff1f4', textColor: '#5a2633', mutedColor: '#8c5a66', accentColor: '#e0465f', buttonColor: '#ff8fab', buttonShadow: true, bandColor: '#b0707f' }),
  tpl('hero-forest', '滿版・森林', 'dark', { layout: 'hero', linkStyle: 'left', bgColor: '#17231d', textColor: '#e6efe9', mutedColor: '#9fb3a7', accentColor: '#b8e0c4', buttonShape: 'rounded', buttonFill: 'soft', buttonColor: '#24352c', buttonTextColor: '#e6efe9', bandColor: '#2f4a3c' }),
  // 名片卡:資料放在浮起的卡片裡
  tpl('card-sky', '名片卡・晴空', 'lively', { layout: 'card', linkStyle: 'button', bgColor: '#eef6ff', textColor: '#1d3557', mutedColor: '#5a7193', accentColor: '#2f6fd6', bandColor: '#9ccbff', buttonColor: '#3d8bfd' }),
  tpl('card-sage', '名片卡・鼠尾草', 'minimal', { layout: 'card', linkStyle: 'list', bgColor: '#eef1ea', textColor: '#34412e', mutedColor: '#6b7764', accentColor: '#5b7a4a', bandColor: '#bfcbb3' }),
  tpl('card-wine', '名片卡・酒紅', 'dark', { layout: 'card', linkStyle: 'left', bgColor: '#2a0f17', textColor: '#f6e9ec', mutedColor: '#c7a3ad', accentColor: '#ffb3c3', bandColor: '#702838', buttonColor: '#f6e9ec', buttonTextColor: '#2a0f17', font: 'serif' }),
  tpl('card-peach', '名片卡・蜜桃', 'lively', { layout: 'card', linkStyle: 'card', bgType: 'gradient', bgColor: '#ffe9df', bgColor2: '#ffd6e3', textColor: '#5a2633', mutedColor: '#8c5a66', accentColor: '#e0465f', bandColor: '#ffb3a7', buttonColor: '#ff8a8a', buttonShape: 'rounded' }),
  // 左右並排:大頭照在左,名稱在右
  tpl('split-paper', '並排・留白', 'minimal', { layout: 'split', linkStyle: 'list', bgColor: '#ffffff', textColor: '#222222', mutedColor: '#777777', accentColor: '#222222', avatarShape: 'square' }),
  tpl('split-lemon', '並排・檸檬格紋', 'lively', { layout: 'split', linkStyle: 'left', bgType: 'grid', bgColor: '#fff8db', textColor: '#4a3b00', mutedColor: '#7a6a2c', accentColor: '#c27c00', buttonShape: 'rounded', buttonColor: '#ffd84d', buttonTextColor: '#3a2e00', avatarShape: 'square' }),
  tpl('split-midnight', '並排・午夜藍', 'dark', { layout: 'split', linkStyle: 'button', bgColor: '#141c2e', textColor: '#e8ecf5', mutedColor: '#9aa6bd', accentColor: '#9cc2ff', buttonFill: 'outline', buttonColor: '#e8ecf5', buttonTextColor: '#e8ecf5', headerBand: true, bandColor: '#25324d' }),
  tpl('split-linen', '並排・亞麻', 'minimal', { layout: 'split', linkStyle: 'card', bgColor: '#efe6da', textColor: '#5a4634', mutedColor: '#8a7462', accentColor: '#8a5a35', buttonColor: '#8a6e55', buttonShape: 'rounded', font: 'serif' }),
  // 雜誌大圖:大字名稱+直式大照片
  tpl('mag-mono', '雜誌・黑白', 'minimal', { layout: 'magazine', linkStyle: 'list', bgColor: '#ffffff', textColor: '#111111', mutedColor: '#666666', accentColor: '#111111', buttonShape: 'square', font: 'classic' }),
  tpl('mag-cocoa', '雜誌・可可', 'dark', { layout: 'magazine', linkStyle: 'left', bgType: 'gradient', bgColor: '#3b2a22', bgColor2: '#1f1612', textColor: '#f3e9e1', mutedColor: '#c4ad9c', accentColor: '#e8c39e', buttonShape: 'rounded', buttonFill: 'outline', buttonColor: '#d9b99b', buttonTextColor: '#f3e9e1', font: 'serif' }),
  tpl('mag-lavender', '雜誌・薰衣草', 'lively', { layout: 'magazine', linkStyle: 'button', bgType: 'gradient', bgColor: '#f1e9ff', bgColor2: '#dfe9ff', textColor: '#3d3270', mutedColor: '#6f66a0', accentColor: '#6a4fd6', buttonColor: '#ffffff', buttonTextColor: '#4b3c7a', buttonShadow: true }),
  tpl('mag-ivory', '雜誌・米白', 'minimal', { layout: 'magazine', linkStyle: 'card', bgColor: '#f6f2ec', textColor: '#1f1b19', mutedColor: '#6b6156', buttonColor: '#1f1b19', buttonShape: 'rounded', font: 'serif' }),
  // 極簡:小頭像+細線
  tpl('min-stone', '極簡・石墨', 'minimal', { layout: 'minimal', linkStyle: 'list', bgColor: '#ececea', textColor: '#2b2b2b', mutedColor: '#6e6e6a', accentColor: '#2b2b2b', font: 'classic' }),
  tpl('min-starry', '極簡・星空', 'dark', { layout: 'minimal', linkStyle: 'left', bgType: 'dots', bgColor: '#10131f', textColor: '#eef0ff', mutedColor: '#a3a9cc', accentColor: '#ffd36b', buttonShape: 'rounded', buttonColor: '#2b3150', buttonTextColor: '#eef0ff' }),
  tpl('min-mint', '極簡・薄荷', 'lively', { layout: 'minimal', linkStyle: 'button', bgType: 'stripes', bgColor: '#e6f7f0', textColor: '#1f4d3c', mutedColor: '#4f7a69', accentColor: '#1d9a6c', buttonShape: 'rounded', buttonColor: '#2fb380' }),
  // 經典置中
  tpl('ivory', '經典・米白', 'minimal', {}),
  tpl('burgundy', '經典・酒紅', 'minimal', { bgColor: '#f4ece6', textColor: '#3a1820', mutedColor: '#7a5a60', accentColor: '#702838', buttonColor: '#702838', font: 'serif' }),
  tpl('notebook', '經典・手帳', 'lively', { linkStyle: 'left', bgType: 'grid', bgColor: '#f3f6ee', textColor: '#2f3b2a', mutedColor: '#66735f', accentColor: '#5b7a4a', buttonFill: 'soft', buttonColor: '#dfe8d6', buttonTextColor: '#2f3b2a', buttonShape: 'rounded', avatarShape: 'square', buttonShadow: true }),
  tpl('candy', '經典・糖果', 'lively', { bgType: 'dots', bgColor: '#fff0f5', textColor: '#6a2a45', mutedColor: '#9a6078', accentColor: '#e0447c', buttonColor: '#ff9ec0', buttonShadow: true, headerBand: true, bandColor: '#ffc2d6' }),
];

// 深色背景判斷(卡片底色、標籤底色跟著切換)
export function isDarkColor(hex: string) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

export function resolveTheme(theme: unknown): CardTheme {
  const t = (theme && typeof theme === 'object' ? theme : {}) as Partial<CardTheme>;
  return { ...DEFAULT_THEME, ...t };
}

export const FONT_OPTIONS: { key: CardTheme['font']; label: string; css: string }[] = [
  { key: 'sans', label: '黑體', css: 'system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif' },
  { key: 'serif', label: '明體', css: '"Noto Serif TC", "Songti TC", "PMingLiU", serif' },
  { key: 'classic', label: '英文襯線', css: 'Georgia, "Times New Roman", "Noto Serif TC", serif' },
];

// ---------- 資料 ----------
export type ProfileCard = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string;
  email: string;
  show_email: boolean;
  bio: string;
  show_bio: boolean;
  socials: SocialLink[];
  show_socials: boolean;
  tags: string[];
  show_tags: boolean;
  theme: Partial<CardTheme>;
  published: boolean;
  seo_title: string;
  seo_description: string;
  seo_image: string;
  show_footer_logo: boolean;
  created_at?: string;
  updated_at?: string;
};

export type BlockType = 'link' | 'text' | 'image' | 'product' | 'video' | 'line' | 'divider';

export type ProfileCardBlock = {
  id: string;
  card_id: string;
  type: BlockType;
  title: string;
  url: string;
  image: string;
  product_id: string;
  enabled: boolean;
  sort_order: number;
  clicks: number;
  start_at: string | null;
  end_at: string | null;
  items?: BlockItem[];
  options?: BlockOptions;
};

// ---------- 圖文連結 ----------
export type BlockItem = { image: string; title: string; url: string };
export type ImageLayout =
  | 'banner' | 'overlay' | 'top' | 'tall' | 'square' | 'card' | 'card-right'
  | 'grid2' | 'grid3' | 'circle3' | 'mosaic' | 'mosaic5' | 'scroll';
export type BlockOptions = { layout?: ImageLayout; captionMode?: 'link' | 'custom'; autoplay?: boolean };

export const IMAGE_LIMIT = 10;
export const LINK_TITLE_LIMIT = 80;

// single:一次顯示一張,多張時自動變成可左右滑動的輪播
export const IMAGE_LAYOUTS: { key: ImageLayout; label: string; single: boolean }[] = [
  { key: 'banner', label: '標題在下', single: true },
  { key: 'top', label: '標題在上', single: true },
  { key: 'overlay', label: '標題疊圖', single: true },
  { key: 'tall', label: '直式 4:5', single: true },
  { key: 'square', label: '方形 1:1', single: true },
  { key: 'card', label: '卡片・左圖', single: true },
  { key: 'card-right', label: '卡片・右圖', single: true },
  { key: 'scroll', label: '橫向滑動', single: false },
  { key: 'grid2', label: '兩欄', single: false },
  { key: 'grid3', label: '三欄方格', single: false },
  { key: 'circle3', label: '三個圓形', single: false },
  { key: 'mosaic', label: '一大兩小', single: false },
  { key: 'mosaic5', label: '一大四小', single: false },
];

// 舊資料只有 image 欄位:當成一張圖
export function blockItems(block: Pick<ProfileCardBlock, 'image' | 'items'>): BlockItem[] {
  const items = Array.isArray(block.items) ? block.items.filter((i) => i && i.image) : [];
  if (items.length) return items;
  return block.image ? [{ image: block.image, title: '', url: '' }] : [];
}

export function blockOptions(block: Pick<ProfileCardBlock, 'options'>): Required<BlockOptions> {
  const o = (block.options && typeof block.options === 'object' ? block.options : {}) as BlockOptions;
  return {
    layout: IMAGE_LAYOUTS.some((l) => l.key === o.layout) ? (o.layout as ImageLayout) : 'banner',
    captionMode: o.captionMode === 'custom' ? 'custom' : 'link',
    autoplay: Boolean(o.autoplay),
  };
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/;
export const MAX_TAGS = 3;
export const BIO_LIMIT = 80;

export const BLOCK_TYPES: { type: BlockType; label: string; hint: string }[] = [
  { type: 'link', label: '連結按鈕', hint: '標題＋網址,可加縮圖' },
  { type: 'text', label: '文字標題', hint: '分隔標題或一段公告' },
  { type: 'image', label: '圖文連結', hint: '多張圖片,多種版型' },
  { type: 'product', label: '商品卡', hint: '選擇網站上的商品' },
  { type: 'video', label: '影片', hint: 'YouTube 影片網址' },
  { type: 'line', label: 'LINE 加好友', hint: '一鍵加入官方 LINE' },
  { type: 'divider', label: '分隔線', hint: '純排版用' },
];

export const TAG_SUGGESTIONS = ['印花 T', '客製團服', '日常穿搭', '質感選品', '情侶裝', '親子裝', '機能服飾', '配件'];

// 社群平台:value 可填帳號或完整網址,顯示時統一轉成網址
export const SOCIAL_PLATFORMS: { type: string; label: string; placeholder: string; toUrl: (v: string) => string }[] = [
  { type: 'instagram', label: 'Instagram', placeholder: '帳號或網址', toUrl: (v) => `https://www.instagram.com/${v.replace(/^@/, '')}` },
  { type: 'line', label: 'LINE', placeholder: 'LINE ID(例如 @urbanite)或網址', toUrl: (v) => `https://line.me/R/ti/p/${encodeURIComponent(v.startsWith('@') ? v : `@${v}`)}` },
  { type: 'facebook', label: 'Facebook', placeholder: '帳號或網址', toUrl: (v) => `https://www.facebook.com/${v}` },
  { type: 'threads', label: 'Threads', placeholder: '帳號或網址', toUrl: (v) => `https://www.threads.net/@${v.replace(/^@/, '')}` },
  { type: 'tiktok', label: 'TikTok', placeholder: '帳號或網址', toUrl: (v) => `https://www.tiktok.com/@${v.replace(/^@/, '')}` },
  { type: 'youtube', label: 'YouTube', placeholder: '頻道網址', toUrl: (v) => `https://www.youtube.com/${v.startsWith('@') ? v : `@${v}`}` },
  { type: 'xiaohongshu', label: '小紅書', placeholder: '個人頁網址', toUrl: (v) => v },
  { type: 'pinterest', label: 'Pinterest', placeholder: '帳號或網址', toUrl: (v) => `https://www.pinterest.com/${v}` },
  { type: 'x', label: 'X', placeholder: '帳號或網址', toUrl: (v) => `https://x.com/${v.replace(/^@/, '')}` },
];

export function socialUrl(link: SocialLink) {
  const value = link.value.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}\//i.test(value)) return `https://${value}`;
  const platform = SOCIAL_PLATFORMS.find((p) => p.type === link.type);
  return platform ? platform.toUrl(value) : value;
}

// 網址欄位:沒寫 http 的自動補上;站內路徑保留
export function normalizeUrl(url: string) {
  const v = url.trim();
  if (!v) return '';
  if (/^(https?:|mailto:|tel:|\/)/i.test(v)) return v;
  return `https://${v}`;
}

// YouTube 網址 → 嵌入網址
export function videoEmbedUrl(url: string) {
  const v = url.trim();
  const yt = v.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = v.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return '';
}

// 內容不完整的區塊視為草稿,前台不顯示
export function isBlockComplete(block: Pick<ProfileCardBlock, 'type' | 'title' | 'url' | 'image' | 'product_id' | 'items'>) {
  switch (block.type) {
    case 'link': return Boolean(block.title.trim() && block.url.trim());
    case 'text': return Boolean(block.title.trim());
    case 'image': return Boolean(block.url.trim() && blockItems(block).length);
    case 'product': return Boolean(block.product_id.trim());
    case 'video': return Boolean(videoEmbedUrl(block.url));
    case 'line':
    case 'divider': return true;
    default: return false;
  }
}

// 限時區塊:未到開始時間或已過結束時間就不顯示
export function isBlockInWindow(block: Pick<ProfileCardBlock, 'start_at' | 'end_at'>, now = Date.now()) {
  if (block.start_at && new Date(block.start_at).getTime() > now) return false;
  if (block.end_at && new Date(block.end_at).getTime() < now) return false;
  return true;
}

export function cardPath(slug: string) {
  return `/@${slug}`;
}

// 流量來源(依 utm / 瀏覽器 / 來源網址判斷,不記個資)
export const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  line: 'LINE',
  facebook: 'Facebook',
  threads: 'Threads',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  xiaohongshu: '小紅書',
  google: 'Google',
  site: '官網',
  other: '其他網站',
  direct: '直接開啟',
};

export function detectSource(ua: string, referrer: string, utm: string | null) {
  const u = (utm || '').toLowerCase();
  if (u) {
    const hit = Object.keys(SOURCE_LABELS).find((k) => u.includes(k) || (k === 'instagram' && u === 'ig') || (k === 'facebook' && u === 'fb'));
    if (hit) return hit;
  }
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/\bLine\//i.test(ua)) return 'line';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/Barcelona/i.test(ua)) return 'threads';
  if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return 'tiktok';
  const r = referrer.toLowerCase();
  if (!r) return 'direct';
  if (r.includes('instagram')) return 'instagram';
  if (r.includes('line.me')) return 'line';
  if (r.includes('facebook') || r.includes('fb.')) return 'facebook';
  if (r.includes('threads')) return 'threads';
  if (r.includes('tiktok')) return 'tiktok';
  if (r.includes('youtube') || r.includes('youtu.be')) return 'youtube';
  if (r.includes('xiaohongshu') || r.includes('xhslink')) return 'xiaohongshu';
  if (r.includes('google')) return 'google';
  if (r.includes('urbanite')) return 'site';
  return 'other';
}
