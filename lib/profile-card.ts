// 個人名片頁:前後台共用的型別與規則

export type SocialLink = { type: string; value: string };

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
  theme: Record<string, unknown>;
  published: boolean;
  created_at?: string;
  updated_at?: string;
};

export type BlockType = 'link' | 'text' | 'image' | 'product';

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
};

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/;
export const MAX_TAGS = 3;
export const BIO_LIMIT = 80;

export const BLOCK_TYPES: { type: BlockType; label: string; hint: string }[] = [
  { type: 'link', label: '連結按鈕', hint: '標題＋網址,可加縮圖' },
  { type: 'text', label: '文字標題', hint: '分隔標題或一段公告' },
  { type: 'image', label: '圖片', hint: '橫幅圖片,可設連結' },
  { type: 'product', label: '商品卡', hint: '選擇網站上的商品' },
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

// 內容不完整的區塊視為草稿,前台不顯示
export function isBlockComplete(block: Pick<ProfileCardBlock, 'type' | 'title' | 'url' | 'image' | 'product_id'>) {
  if (block.type === 'link') return Boolean(block.title.trim() && block.url.trim());
  if (block.type === 'text') return Boolean(block.title.trim());
  if (block.type === 'image') return Boolean(block.image.trim());
  if (block.type === 'product') return Boolean(block.product_id.trim());
  return false;
}

export function cardPath(slug: string) {
  return `/@${slug}`;
}
