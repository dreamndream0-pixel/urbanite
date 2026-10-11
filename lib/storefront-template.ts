import { resolveBlocks, type StorefrontBlock } from './storefront-blocks';

export const STOREFRONT_TEMPLATES = [
  { key: 'classic', name: '經典商城型', en: 'Classic Shop', note: '最常見的電商版型,商品分類清楚,適合各種產業' },
  { key: 'editorial', name: '品牌雜誌型', en: 'Editorial', note: '大圖形象+精選商品,強調品牌氛圍,適合服飾、美妝、香氛' },
  { key: 'gallery', name: '視覺圖冊型', en: 'Gallery', note: '以大圖拼貼展示,點擊即可進入商品,適合設計品牌、選物店' },
  { key: 'campaign', name: '主題活動型', en: 'Campaign', note: '活動主視覺+精選商品+倒數,適合節慶、聯名、新品活動' },
] as const;
export type StorefrontTemplate = typeof STOREFRONT_TEMPLATES[number]['key'];
export const STOREFRONT_TEXT_FIELDS = [
  { key: 'title', label: '主視覺標題', max: 80 },
  { key: 'subtitle', label: '主視覺副標題', max: 160 },
  { key: 'action', label: '主視覺按鈕', max: 24 },
  { key: 'productsTitle', label: '商品區標題', max: 60 },
  { key: 'featureTitle', label: '品牌專題標題', max: 80 },
  { key: 'featureText', label: '品牌專題內文', max: 240 },
] as const;
export type StorefrontTextKey = typeof STOREFRONT_TEXT_FIELDS[number]['key'];
export type StorefrontDesign = { enabled: boolean; style: StorefrontTemplate; blocks?: StorefrontBlock[] } & Record<StorefrontTextKey, string>;
export const DEFAULT_STOREFRONT: StorefrontDesign = {
  enabled: false, style: 'classic', title: 'New Collection', subtitle: '日常裡的選擇',
  action: '探索商品', productsTitle: '精選商品', featureTitle: '品牌日常', featureText: '找到屬於你的生活風格。',
};
export function resolveStorefront(raw: unknown): StorefrontDesign {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_STOREFRONT };
  result.enabled = value.enabled === true;
  const blocks = resolveBlocks(value.blocks);
  if (blocks !== undefined) result.blocks = blocks;
  if (STOREFRONT_TEMPLATES.some((t) => t.key === value.style)) result.style = value.style as StorefrontTemplate;
  for (const field of STOREFRONT_TEXT_FIELDS) {
    if (typeof value[field.key] === 'string') result[field.key] = (value[field.key] as string).trim().slice(0, field.max);
  }
  return result;
}
