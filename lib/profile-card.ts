// 個人名片頁:前後台共用的型別與規則

export type SocialLink = { type: string; value: string };

// ---------- 外觀 ----------
export type CardTheme = {
  template: string;
  bgType: 'color' | 'image' | 'grid';
  bgColor: string;
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
};

export const DEFAULT_THEME: CardTheme = {
  template: 'ivory',
  bgType: 'color',
  bgColor: '#f6f2ec',
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
};

// 預設樣板:套用後仍可再微調
export const CARD_TEMPLATES: { key: string; name: string; theme: Partial<CardTheme> }[] = [
  { key: 'ivory', name: '經典米白', theme: { ...DEFAULT_THEME } },
  {
    key: 'burgundy',
    name: '酒紅質感',
    theme: { bgType: 'color', bgColor: '#f4ece6', textColor: '#3a1820', mutedColor: '#7a5a60', accentColor: '#702838', buttonFill: 'solid', buttonColor: '#702838', buttonTextColor: '#ffffff', buttonShape: 'pill', font: 'serif', avatarShape: 'circle', align: 'center', buttonShadow: false },
  },
  {
    key: 'mono',
    name: '黑白時尚',
    theme: { bgType: 'color', bgColor: '#ffffff', textColor: '#111111', mutedColor: '#666666', accentColor: '#111111', buttonFill: 'outline', buttonColor: '#111111', buttonTextColor: '#111111', buttonShape: 'square', font: 'classic', avatarShape: 'portrait', align: 'left', buttonShadow: false },
  },
  {
    key: 'notebook',
    name: '手帳格紋',
    theme: { bgType: 'grid', bgColor: '#f3f6ee', textColor: '#2f3b2a', mutedColor: '#66735f', accentColor: '#5b7a4a', buttonFill: 'soft', buttonColor: '#dfe8d6', buttonTextColor: '#2f3b2a', buttonShape: 'rounded', font: 'sans', avatarShape: 'square', align: 'center', buttonShadow: true },
  },
  {
    key: 'mist',
    name: '柔霧灰藍',
    theme: { bgType: 'color', bgColor: '#e9edf1', textColor: '#26313b', mutedColor: '#5d6b78', accentColor: '#3f5c78', buttonFill: 'solid', buttonColor: '#ffffff', buttonTextColor: '#26313b', buttonShape: 'rounded', font: 'sans', avatarShape: 'circle', align: 'center', buttonShadow: true },
  },
];

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
