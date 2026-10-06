// 個人名片頁:前後台共用的型別與規則

export type SocialLink = { type: string; value: string };

// ---------- 外觀 ----------
export type ProfileLayout =
  | 'classic' | 'hero' | 'card' | 'split' | 'magazine' | 'minimal'
  | 'polaroid' | 'label' | 'arch' | 'floating' | 'side' | 'blob' | 'sticker' | 'news' | 'framed' | 'boxed' | 'search';
export type LinkStyle = 'button' | 'left' | 'list' | 'card' | 'bar' | 'underline' | 'gradient';

export const PROFILE_LAYOUTS: { key: ProfileLayout; label: string }[] = [
  { key: 'hero', label: '滿版封面' },
  { key: 'polaroid', label: '拍立得' },
  { key: 'label', label: '斜角名牌' },
  { key: 'arch', label: '弧形照片' },
  { key: 'floating', label: '浮動名片' },
  { key: 'side', label: '半版照片' },
  { key: 'blob', label: '花邊相框' },
  { key: 'sticker', label: '側欄標籤' },
  { key: 'news', label: '報紙' },
  { key: 'framed', label: '相框' },
  { key: 'boxed', label: '卡片' },
  { key: 'search', label: '搜尋列' },
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
  { key: 'bar', label: '左側色條' },
  { key: 'underline', label: '底線色塊' },
  { key: 'gradient', label: '漸層按鈕' },
];

export type CardTheme = {
  template: string;
  layout: ProfileLayout; // 頁首版面配置
  linkStyle: LinkStyle; // 連結排列方式
  tagStyle: 'outline' | 'solid' | 'square'; // 標籤樣式
  divider: 'none' | 'wave'; // 簡介與連結之間的分隔
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
  tagStyle: 'outline',
  divider: 'none',
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
  layout: 'classic', linkStyle: 'button', tagStyle: 'outline', divider: 'none', bgType: 'color', bgColor: '#f6f2ec', bgColor2: '#ebe2d6', textColor: '#1f1b19', mutedColor: '#6b6156', accentColor: '#702838',
  avatarShape: 'circle', align: 'center', buttonShape: 'pill', buttonFill: 'solid', buttonColor: '#1f1b19', buttonTextColor: '#ffffff',
  buttonShadow: false, font: 'sans', headerBand: false, bandColor: '#e5dccf',
};
const tpl = (key: string, name: string, category: TemplateCategory, theme: Partial<CardTheme>) => ({ key, name, category, theme: { ...STYLE_BASE, ...theme } });

// 預設樣板(新的排前面):版面配置 × 連結樣式 × 配色,套用後仍可再微調
export const CARD_TEMPLATES: { key: string; name: string; category: TemplateCategory; theme: Partial<CardTheme> }[] = [
  tpl('gray-note', '灰調筆記', 'minimal', { avatarShape: 'square', align: 'left', layout: 'framed', linkStyle: 'bar', tagStyle: 'solid', bgColor: '#e9e9e9', textColor: '#222222', mutedColor: '#666666', accentColor: '#222222', buttonColor: '#9a9a9a', buttonTextColor: '#444444', divider: 'none' }),
  tpl('polaroid-green', '綠格拍立得', 'lively', { avatarShape: 'square', align: 'center', layout: 'polaroid', linkStyle: 'button', bgColor: '#cfdcc5', textColor: '#2f5a2a', mutedColor: '#4c7044', accentColor: '#3f7a33', buttonShape: 'rounded', buttonFill: 'soft', buttonColor: '#e3f0dc', buttonTextColor: '#2f5a2a' }),
  tpl('watercolor', '水彩藍', 'lively', { avatarShape: 'square', align: 'center', layout: 'framed', linkStyle: 'bar', tagStyle: 'solid', bgType: 'gradient', bgColor: '#7fb1ec', bgColor2: '#c9d6f2', textColor: '#0d4a8f', mutedColor: '#1d5c9f', accentColor: '#0d4a8f', buttonColor: '#2f7ae0', buttonTextColor: '#0d4a8f', divider: 'wave', font: 'sans' }),
  tpl('label-sand', '暖杏名牌', 'lively', { avatarShape: 'square', align: 'left', layout: 'label', linkStyle: 'underline', tagStyle: 'square', bgColor: '#fbf3e6', textColor: '#6b4a1f', mutedColor: '#8a6b42', accentColor: '#d9a85f', buttonColor: '#e3b45c', buttonTextColor: '#6b4a1f' }),
  tpl('side-noir', '半版黑', 'dark', { avatarShape: 'square', align: 'left', layout: 'side', linkStyle: 'list', tagStyle: 'solid', bgColor: '#1c1c1c', textColor: '#f2f2f2', mutedColor: '#cfcfcf', accentColor: '#ffffff', font: 'serif' }),
  tpl('arch-aurora', '極光弧形', 'lively', { avatarShape: 'square', align: 'center', layout: 'arch', linkStyle: 'underline', tagStyle: 'solid', bgType: 'gradient', bgColor: '#a6e3d8', bgColor2: '#d9b8f0', textColor: '#0f4c8a', mutedColor: '#1f5f9a', accentColor: '#0f4c8a', buttonColor: '#0f4c8a', buttonTextColor: '#0f4c8a' }),
  tpl('float-latte', '拿鐵浮卡', 'minimal', { avatarShape: 'circle', align: 'left', layout: 'floating', linkStyle: 'button', bgColor: '#e3cfae', textColor: '#6b4321', mutedColor: '#7f5a38', accentColor: '#6b4321', bandColor: '#b9c9e6', buttonShape: 'rounded', buttonColor: '#fff8e8', buttonTextColor: '#5a3a1c' }),
  tpl('search-sketch', '素描搜尋', 'minimal', { avatarShape: 'square', align: 'center', layout: 'search', linkStyle: 'bar', bgColor: '#fdfcfa', textColor: '#4a3a30', mutedColor: '#7a685a', accentColor: '#7a5a48', buttonColor: '#7a5a48', buttonTextColor: '#4a3a30', font: 'classic' }),
  tpl('blob-night', '夜空花邊', 'dark', { avatarShape: 'circle', align: 'center', layout: 'blob', linkStyle: 'button', tagStyle: 'solid', bgColor: '#173d63', textColor: '#ffffff', mutedColor: '#d7e3f1', accentColor: '#ffffff', buttonShape: 'rounded', buttonFill: 'outline', buttonColor: '#e7eef7', buttonTextColor: '#ffffff' }),
  tpl('framed-wood', '木紋相框', 'dark', { avatarShape: 'square', align: 'center', layout: 'framed', linkStyle: 'left', tagStyle: 'solid', bgType: 'gradient', bgColor: '#8a5a32', bgColor2: '#4a2c16', textColor: '#ffffff', mutedColor: '#f1e2d2', accentColor: '#ffe7c7', buttonShape: 'rounded', buttonColor: '#fff3ea', buttonTextColor: '#8a6a55', font: 'serif' }),
  tpl('polaroid-red', '紅格拍立得', 'lively', { avatarShape: 'square', align: 'center', layout: 'polaroid', linkStyle: 'left', bgType: 'dots', bgColor: '#fff6f2', textColor: '#a3131a', mutedColor: '#b8434a', accentColor: '#a3131a', buttonColor: '#ffe3e6', buttonTextColor: '#a3131a', font: 'serif' }),
  tpl('split-pink', '粉紅並排', 'lively', { avatarShape: 'circle', align: 'left', layout: 'split', linkStyle: 'card', tagStyle: 'solid', bgType: 'stripes', bgColor: '#fdf0ef', textColor: '#6b3a20', mutedColor: '#8a5a40', accentColor: '#6b3a20', buttonColor: '#8a5a40', buttonShape: 'rounded' }),
  tpl('smoky', '煙燻黑', 'dark', { avatarShape: 'square', align: 'left', layout: 'framed', linkStyle: 'bar', tagStyle: 'solid', bgType: 'gradient', bgColor: '#3a3a3a', bgColor2: '#1a1a1a', textColor: '#ffffff', mutedColor: '#e0e0e0', accentColor: '#ffffff', buttonColor: '#ffffff', buttonTextColor: '#ffffff', divider: 'wave' }),
  tpl('sticker-sky', '天藍側標', 'lively', { avatarShape: 'circle', align: 'left', layout: 'sticker', linkStyle: 'left', tagStyle: 'square', bgColor: '#ffffff', textColor: '#1d5fa8', mutedColor: '#3a78bd', accentColor: '#14b4e8', buttonShape: 'pill', buttonFill: 'outline', buttonColor: '#1d5fa8', buttonTextColor: '#1d5fa8' }),
  tpl('label-coffee', '咖啡名牌', 'minimal', { avatarShape: 'square', align: 'left', layout: 'label', linkStyle: 'card', tagStyle: 'solid', bgColor: '#fdf6ec', textColor: '#5a3a1c', mutedColor: '#7a5a3c', accentColor: '#7a4a1c', buttonColor: '#7a4a1c', buttonShape: 'square' }),
  tpl('label-peach', '蜜桃漸層', 'lively', { avatarShape: 'square', align: 'left', layout: 'label', linkStyle: 'gradient', bgType: 'gradient', bgColor: '#ffd3c4', bgColor2: '#ffe6c2', textColor: '#e2563f', mutedColor: '#f07a62', accentColor: '#f26d6d', buttonShape: 'square', buttonColor: '#ff8a5c', buttonTextColor: '#ffffff', divider: 'wave' }),
  tpl('float-dark', '暗夜浮卡', 'dark', { avatarShape: 'circle', align: 'left', layout: 'floating', linkStyle: 'gradient', bgColor: '#2b2b2b', textColor: '#f2f2f2', mutedColor: '#cfcfcf', accentColor: '#ffffff', bandColor: '#3d3d3d', buttonColor: '#ffffff', buttonTextColor: '#222222' }),
  tpl('news', '每日新聞', 'lively', { avatarShape: 'portrait', align: 'left', layout: 'news', linkStyle: 'left', bgType: 'gradient', bgColor: '#bfe4ff', bgColor2: '#7fb6f2', textColor: '#0f3d73', mutedColor: '#1f4f88', accentColor: '#0f3d73', buttonColor: '#1a5aa8', buttonTextColor: '#ffffff' }),
  tpl('framed-mist', '霧林', 'dark', { avatarShape: 'square', align: 'center', layout: 'framed', linkStyle: 'card', tagStyle: 'solid', bgType: 'gradient', bgColor: '#7d9790', bgColor2: '#53665f', textColor: '#ffffff', mutedColor: '#eef3f1', accentColor: '#ffffff', buttonColor: '#2a2a2a', buttonFill: 'soft', buttonShape: 'rounded', font: 'serif' }),
  tpl('blob-star', '星芒金', 'dark', { avatarShape: 'circle', align: 'center', layout: 'blob', linkStyle: 'left', tagStyle: 'solid', bgColor: '#0d0d0d', textColor: '#f0c27a', mutedColor: '#f5e6cc', accentColor: '#f0c27a', buttonShape: 'pill', buttonColor: '#fdf1dc', buttonTextColor: '#b07a2a', font: 'classic' }),
  tpl('boxed-daisy', '雛菊卡片', 'lively', { avatarShape: 'square', align: 'center', layout: 'boxed', linkStyle: 'left', bgType: 'dots', bgColor: '#fffbe6', textColor: '#6b4a10', mutedColor: '#7a5a20', accentColor: '#7a4a10', buttonColor: '#ffe27a', buttonTextColor: '#4a3510' }),
  tpl('sticker-mint', '薄荷側標', 'lively', { avatarShape: 'circle', align: 'left', layout: 'sticker', linkStyle: 'left', tagStyle: 'square', bgType: 'grid', bgColor: '#eaf7fb', textColor: '#3aa6a6', mutedColor: '#4cb3b3', accentColor: '#5cc2bf', buttonColor: '#5cc2bf', buttonTextColor: '#ffffff' }),
  tpl('hero-sun', '滿版・暖陽', 'lively', { avatarShape: 'circle', align: 'center', layout: 'hero', linkStyle: 'left', bgColor: '#fdf4e7', textColor: '#3a2a14', mutedColor: '#7a6448', accentColor: '#c46a00', buttonColor: '#ffc978', buttonTextColor: '#3a2a10', bandColor: '#5a4a3a' }),
  tpl('mag-mono', '雜誌・黑白', 'minimal', { avatarShape: 'portrait', align: 'left', layout: 'magazine', linkStyle: 'list', bgColor: '#ffffff', textColor: '#111111', mutedColor: '#666666', accentColor: '#111111', buttonShape: 'square', font: 'classic' }),
];

// 深色背景判斷(卡片底色、標籤底色跟著切換)
export function isDarkColor(hex: string) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

// ---------- 封面照片顯示規格 ----------
export type CoverSpec = {
  aspect: number | null; // 寬/高;null = 依原圖比例完整顯示
  position: string; // 裁切對齊位置(object-position)
  where: string; // 顯示位置說明
  ratio: string; // 顯示比例
  size: string; // 建議上傳尺寸
  round?: boolean; // 圓形裁切
  arch?: boolean; // 底部弧形
};

export const COVER_BAND_POSITION = 'center 22%'; // 頂部橫幅:直式照片優先保留上半部

const BAND_5_2: CoverSpec = { aspect: 5 / 2, position: COVER_BAND_POSITION, where: '最上方橫幅', ratio: '5:2 橫式', size: '1500×600' };
const BAND_3_1: CoverSpec = { aspect: 3, position: COVER_BAND_POSITION, where: '最上方橫幅', ratio: '3:1 橫式', size: '1500×500' };
const NATURAL: CoverSpec = { aspect: null, position: 'center', where: '大照片(完整顯示,不裁切)', ratio: '依原圖比例', size: '1080×1350 直式或 1080×1080 方形' };

export function coverSpec(layout: ProfileLayout, shape: CardTheme['avatarShape'] = 'circle'): CoverSpec {
  switch (layout) {
    case 'hero':
      return { aspect: 4 / 5, position: 'center', where: '滿版背景(延伸到名稱與簡述後方)', ratio: '4:5 直式', size: '1080×1350' };
    case 'magazine':
      return shape === 'portrait'
        ? { aspect: 4 / 5, position: 'center', where: '名稱下方大照片', ratio: '4:5 直式', size: '1080×1350' }
        : { aspect: 1, position: 'center', where: '名稱下方大照片', ratio: shape === 'circle' ? '1:1 圓形' : '1:1 方形', size: '1080×1080', round: shape === 'circle' };
    case 'label':
    case 'search':
      return NATURAL;
    case 'arch':
      return { ...NATURAL, where: '大照片(完整顯示,底部弧形)', arch: true };
    case 'side':
      return { aspect: 3 / 4, position: 'center', where: '左半邊照片', ratio: '約 3:4 直式', size: '1080×1440' };
    case 'floating':
    case 'split':
    case 'minimal':
      return BAND_3_1;
    default:
      return BAND_5_2; // classic、card,以及相框類版面(拍立得、相框、花邊、側欄、報紙、卡片)
  }
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
  onboarded?: boolean; // 第一次設定暱稱與網址完成
  referred_by?: string; // 推薦人的名片 id
  referral_rewards?: number; // 已領取的推薦獎勵次數
  created_at?: string;
  updated_at?: string;
};

export type BlockType = 'link' | 'text' | 'image' | 'product' | 'video' | 'line' | 'divider' | 'social';

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
// 社群追蹤卡片:platform 平台、statA / statB 兩個數字欄(自行填寫)、button 按鈕文字
export type BlockOptions = { layout?: ImageLayout; captionMode?: 'link' | 'custom'; autoplay?: boolean; platform?: string; statA?: string; statB?: string; button?: string; bio?: string; fetchedAt?: string; fetchedUrl?: string };

export const IMAGE_LIMIT = 10;
export const LINK_TITLE_LIMIT = 80;

// single:一次顯示一張,多張時自動變成可左右滑動的輪播
// ratio / size:名片頁實際顯示的圖片比例與建議上傳尺寸(與 ProfileImageBlock 的版面一致)
export const IMAGE_LAYOUTS: { key: ImageLayout; label: string; single: boolean; ratio: string; size: string }[] = [
  { key: 'banner', label: '標題在下', single: true, ratio: '1 張原比例・多張 16:9', size: '1600×900' },
  { key: 'top', label: '標題在上', single: true, ratio: '1 張原比例・多張 16:9', size: '1600×900' },
  { key: 'overlay', label: '標題疊圖', single: true, ratio: '1 張原比例・多張 16:9', size: '1600×900' },
  { key: 'tall', label: '直式 4:5', single: true, ratio: '4:5 直式', size: '1080×1350' },
  { key: 'square', label: '方形 1:1', single: true, ratio: '1:1 方形', size: '1080×1080' },
  { key: 'card', label: '卡片・左圖', single: true, ratio: '1:1 小縮圖', size: '600×600' },
  { key: 'card-right', label: '卡片・右圖', single: true, ratio: '1:1 小縮圖', size: '600×600' },
  { key: 'scroll', label: '橫向滑動', single: false, ratio: '4:5 直式', size: '1080×1350' },
  { key: 'grid2', label: '兩欄', single: false, ratio: '1:1 方形', size: '1080×1080' },
  { key: 'grid3', label: '三欄方格', single: false, ratio: '1:1 方形', size: '800×800' },
  { key: 'circle3', label: '三個圓形', single: false, ratio: '1:1 圓形裁切', size: '800×800(主體置中)' },
  { key: 'mosaic', label: '一大兩小', single: false, ratio: '大圖約 3:4・小圖 3:2', size: '大圖 1080×1440・小圖 1200×800' },
  { key: 'mosaic5', label: '一大四小', single: false, ratio: '1:1 方形', size: '大圖 1080×1080・小圖 600×600' },
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
    platform: FOLLOW_PLATFORMS.some((p) => p.key === o.platform) ? String(o.platform) : 'instagram',
    statA: typeof o.statA === 'string' ? o.statA.slice(0, 40) : '',
    statB: typeof o.statB === 'string' ? o.statB.slice(0, 40) : '',
    button: typeof o.button === 'string' ? o.button.slice(0, 30) : '',
    bio: typeof o.bio === 'string' ? o.bio.slice(0, 120) : '',
    fetchedAt: typeof o.fetchedAt === 'string' ? o.fetchedAt : '',
    fetchedUrl: typeof o.fetchedUrl === 'string' ? o.fetchedUrl : '',
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
  { type: 'social', label: '社群追蹤卡片', hint: 'IG、YouTube、TikTok 等追蹤卡' },
];

// 社群追蹤卡片可選的平台(color = 品牌色,用在角落圖示與按鈕)
export const FOLLOW_PLATFORMS: { key: string; label: string; color: string; action: string }[] = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C', action: '在 Instagram 追蹤' },
  { key: 'youtube', label: 'YouTube', color: '#FF0000', action: '訂閱 YouTube 頻道' },
  { key: 'tiktok', label: 'TikTok', color: '#111111', action: '在 TikTok 追蹤' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2', action: '在 Facebook 追蹤' },
  { key: 'threads', label: 'Threads', color: '#111111', action: '在 Threads 追蹤' },
  { key: 'x', label: 'X', color: '#111111', action: '在 X 追蹤' },
  { key: 'line', label: 'LINE', color: '#06C755', action: '加入 LINE 好友' },
  { key: 'xiaohongshu', label: '小紅書', color: '#FF2442', action: '在小紅書關注' },
  { key: 'pinterest', label: 'Pinterest', color: '#E60023', action: '在 Pinterest 追蹤' },
];

export function followPlatform(key: string | undefined) {
  return FOLLOW_PLATFORMS.find((p) => p.key === key) ?? FOLLOW_PLATFORMS[0];
}

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
    case 'social': return Boolean(block.url.trim());
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
