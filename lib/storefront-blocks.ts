import type { StorefrontDesign } from './storefront-template';

export const BLOCK_TYPES = [
  { key: 'hero', label: '主視覺' }, { key: 'products', label: '商品列表' },
  { key: 'categories', label: '商品分類' }, { key: 'imageText', label: '圖文介紹' },
  { key: 'video', label: '影片' }, { key: 'announcement', label: '公告' },
  { key: 'countdown', label: '倒數計時' }, { key: 'carousel', label: '輪播圖' },
] as const;
export type BlockType = typeof BLOCK_TYPES[number]['key'];
export type StorefrontBlock = {
  id: string; type: BlockType; visible: boolean; title: string; text: string;
  image: string; video: string; action: string; href: string;
  columns: number; spacing: number; background: string; ratio: 'square' | 'portrait' | 'wide';
  source: 'all' | 'category' | 'selected'; category: string; productIds: string[]; limit: number;
  categoryImageStyle?: 'circle' | 'square' | 'cutout';
  endsAt: string; // 倒數計時結束時間 YYYY-MM-DDTHH:mm(台灣時間)
  group: number; // 輪播圖板塊要顯示的輪播圖組(1 = 輪播圖1)
};
export const MAX_BLOCKS = 20;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function safeBlockUrl(value: unknown) {
  const url = text(value, 2048);
  if (!url || /[\s\\\u0000-\u001f]/.test(url)) return '';
  if (/^\/(?!\/)/.test(url) || /^#[a-zA-Z0-9_-]+$/.test(url)) return url;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? url : ''; } catch { return ''; }
}
export function createBlock(type: BlockType, id: string): StorefrontBlock {
  return { id, type, visible: true, title: BLOCK_TYPES.find((t) => t.key === type)?.label ?? '', text: '', image: '', video: '', action: '', href: '', columns: 2, spacing: 24, background: '', ratio: 'wide', source: 'all', category: '', productIds: [], limit: 8, endsAt: '', group: 1 };
}
export function resolveBlocks(raw: unknown): StorefrontBlock[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = new Set<string>();
  return raw.slice(0, MAX_BLOCKS).flatMap((entry, index) => {
    const value = object(entry);
    if (!BLOCK_TYPES.some((t) => t.key === value.type)) return [];
    let id = text(value.id, 80).replace(/[^a-zA-Z0-9_-]/g, '') || `block-${index}`;
    while (ids.has(id)) id += `-${index}`;
    ids.add(id);
    const block = createBlock(value.type as BlockType, id);
    if (value.categoryImageStyle === 'circle' || value.categoryImageStyle === 'square' || value.categoryImageStyle === 'cutout') block.categoryImageStyle = value.categoryImageStyle;
    block.visible = value.visible !== false;
    if (Number.isInteger(value.group) && (value.group as number) >= 1 && (value.group as number) <= 9) block.group = value.group as number;
    if (typeof value.endsAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.endsAt)) block.endsAt = value.endsAt;
    for (const field of ['title', 'text', 'action', 'category'] as const) block[field] = text(value[field], field === 'text' ? 2000 : field === 'action' ? 40 : 120);
    for (const field of ['image', 'video', 'href'] as const) block[field] = safeBlockUrl(value[field]);
    block.background = typeof value.background === 'string' && /^#[0-9a-f]{6}$/i.test(value.background) ? value.background : '';
    block.columns = [1, 2, 3, 4].includes(Number(value.columns)) ? Number(value.columns) : 2;
    block.spacing = typeof value.spacing === 'number' && Number.isFinite(value.spacing) ? Math.min(96, Math.max(0, Math.round(value.spacing))) : 24;
    block.limit = typeof value.limit === 'number' && Number.isFinite(value.limit) ? Math.min(24, Math.max(1, Math.round(value.limit))) : 8;
    if (value.ratio === 'square' || value.ratio === 'portrait') block.ratio = value.ratio;
    if (value.source === 'category' || value.source === 'selected') block.source = value.source;
    block.productIds = Array.isArray(value.productIds) ? [...new Set(value.productIds.filter((id): id is string => typeof id === 'string' && id.length <= 100))].slice(0, 24) : [];
    return [block];
  });
}
// 每個模板的預設文案(對照「多種購物車官網排版模式」示意圖)
export const TEMPLATE_COPY: Record<StorefrontDesign['style'], {
  heroTitle: string; heroText: string; heroAction: string; productsTitle: string; categoriesTitle: string;
  featureTitle: string; featureText: string; countdownTitle?: string;
}> = {
  classic: { heroTitle: 'New Collection', heroText: '日常裡的溫柔', heroAction: '立即選購', productsTitle: '熱銷商品', categoriesTitle: '', featureTitle: 'Daily Wear', featureText: '日常系列' },
  editorial: { heroTitle: 'A better\nday for you', heroText: 'NEW COLLECTION', heroAction: '探索新品', productsTitle: 'Pick for you', categoriesTitle: '', featureTitle: 'Lookbook', featureText: '穿搭靈感' },
  gallery: { heroTitle: 'The Art of\nEveryday', heroText: '', heroAction: '探索系列', productsTitle: '精選商品', categoriesTitle: '', featureTitle: 'NEW IN', featureText: '新品上架' },
  campaign: { heroTitle: 'Sweet\nMoment', heroText: '期間限定・每季系列', heroAction: '立即選購', productsTitle: '活動商品', categoriesTitle: '', featureTitle: 'Gift for You', featureText: '給特別的你', countdownTitle: '限時優惠倒數' },
};
function weekLater() {
  const d = new Date(Date.now() + 7 * 864e5 + 8 * 36e5); // 台灣時間
  return d.toISOString().slice(0, 16);
}
export function starterBlocks(design: Pick<StorefrontDesign, 'style'>): StorefrontBlock[] {
  const style = design.style;
  const copy = TEMPLATE_COPY[style] ?? TEMPLATE_COPY.classic;
  const hero = { ...createBlock('hero', 'hero'), title: copy.heroTitle, text: copy.heroText, action: copy.heroAction, href: '#store-products', ratio: style === 'classic' || style === 'gallery' ? 'square' as const : 'portrait' as const };
  const categories = { ...createBlock('categories', 'categories'), title: copy.categoriesTitle, columns: 2, ratio: 'square' as const };
  const products = { ...createBlock('products', 'products'), title: copy.productsTitle, columns: style === 'editorial' ? 3 : style === 'campaign' ? 2 : 4, limit: style === 'editorial' ? 6 : 8, ratio: 'portrait' as const };
  const feature = { ...createBlock('imageText', 'feature'), title: copy.featureTitle, text: copy.featureText, action: '看更多', href: '#store-products' };
  const countdown = { ...createBlock('countdown', 'countdown'), title: copy.countdownTitle ?? '限時優惠倒數', endsAt: weekLater() };
  // 間距:滿版主視覺貼齊頁首,其他板塊留白
  hero.spacing = style === 'classic' ? 0 : 12;
  categories.spacing = 20;
  products.spacing = 24;
  feature.spacing = 16;
  countdown.spacing = 16;
  switch (style) {
    case 'editorial': return [hero, products, feature];
    case 'gallery': return [hero, categories, feature, products];
    case 'campaign': return [hero, countdown, products, feature];
    default: return [hero, categories, products, feature];
  }
}
// 換模板:套用新模板的板塊順序與預設文案,但保留使用者改過的文字、圖片與商品設定
const CARRY = ['title', 'text', 'image', 'video', 'action', 'href', 'source', 'category', 'productIds', 'limit', 'endsAt', 'group', 'background'] as const;
export function switchTemplate(blocks: StorefrontBlock[], from: StorefrontDesign['style'], to: StorefrontDesign['style']): StorefrontBlock[] {
  const oldDefaults = starterBlocks({ style: from });
  const next = starterBlocks({ style: to }).map((fresh) => {
    const old = blocks.find((b) => b.type === fresh.type);
    if (!old) return fresh;
    const base = oldDefaults.find((b) => b.type === fresh.type);
    const merged = { ...fresh, visible: old.visible } as StorefrontBlock;
    for (const key of CARRY) {
      if (JSON.stringify(old[key]) !== JSON.stringify(base?.[key] ?? createBlock(old.type, 'x')[key])) (merged as Record<string, unknown>)[key] = old[key];
    }
    return merged;
  });
  // 使用者自己加的其他板塊(影片、公告⋯)接在後面,不會不見
  const used = new Set(next.map((b) => b.type));
  return [...next, ...blocks.filter((b) => used.has(b.type) ? blocks.filter((x) => x.type === b.type).indexOf(b) > 0 : b.type === 'video' || b.type === 'announcement' || b.type === 'carousel')].slice(0, MAX_BLOCKS);
}
export function moveBlock(blocks: StorefrontBlock[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return blocks;
  const next = [...blocks];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
