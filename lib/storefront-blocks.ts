import type { StorefrontDesign } from './storefront-template';

export const BLOCK_TYPES = [
  { key: 'hero', label: '主視覺' }, { key: 'products', label: '商品列表' },
  { key: 'categories', label: '商品分類' }, { key: 'imageText', label: '圖文介紹' },
  { key: 'video', label: '影片' }, { key: 'announcement', label: '公告' },
] as const;
export type BlockType = typeof BLOCK_TYPES[number]['key'];
export type StorefrontBlock = {
  id: string; type: BlockType; visible: boolean; title: string; text: string;
  image: string; video: string; action: string; href: string;
  columns: number; spacing: number; background: string; ratio: 'square' | 'portrait' | 'wide';
  source: 'all' | 'category' | 'selected'; category: string; productIds: string[]; limit: number;
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
  return { id, type, visible: true, title: BLOCK_TYPES.find((t) => t.key === type)?.label ?? '', text: '', image: '', video: '', action: '', href: '', columns: 2, spacing: 24, background: '', ratio: 'wide', source: 'all', category: '', productIds: [], limit: 8 };
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
    block.visible = value.visible !== false;
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
export function starterBlocks(design: StorefrontDesign): StorefrontBlock[] {
  const hero = { ...createBlock('hero', 'hero'), title: design.title, text: design.subtitle, action: design.action, href: '#store-products', ratio: design.style === 'editorial' ? 'portrait' as const : 'wide' as const };
  const categories = { ...createBlock('categories', 'categories'), title: '', columns: design.style === 'category' || design.style === 'gallery' ? 2 : 4, ratio: design.style === 'gallery' ? 'portrait' as const : 'square' as const };
  const products = { ...createBlock('products', 'products'), title: design.productsTitle, columns: design.style === 'minimal' ? 2 : design.style === 'editorial' ? 3 : 4 };
  const feature = { ...createBlock(design.style === 'campaign' ? 'announcement' : 'imageText', 'feature'), title: design.featureTitle, text: design.featureText, action: design.action, href: '#store-products' };
  switch (design.style) {
    case 'campaign': return [hero, feature, categories, products];
    case 'editorial':
    case 'minimal': return [hero, products, feature];
    case 'gallery': return [hero, categories, feature, products];
    case 'category': return [categories, hero, products, feature];
    default: return [hero, categories, products, feature];
  }
}
export function moveBlock(blocks: StorefrontBlock[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return blocks;
  const next = [...blocks];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
