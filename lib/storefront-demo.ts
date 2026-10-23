// 後台「選擇首頁排版」卡片用的示意內容:固定的示範商品、分類與主視覺圖
// (不用店家自己的商品與配色,才看得出每種排版本身的樣子)
import type { Banner, Product } from '@/lib/types';
import type { DesignCategory } from '@/app/components/StorefrontDesign';

const IMG = '/storefront-demo';
const product = (id: string, name: string, price: number, image: string, original: number | null = null): Product => ({
  id: `demo-${id}`, name, tagline: '', price, original_price: original, inventory: 10, status: '上架中', category: 'demo-new',
  image: `${IMG}/${image}.webp`, images: [`${IMG}/${image}.webp`], colors: [], sizes: [], specs: [], variants: [],
  is_featured: true, sort_order: 0, campaign_id: null,
});

export const DEMO_PRODUCTS: Product[] = [
  product('knit', '柔霧針織上衣', 1280, 'top'),
  product('skirt', '絲光百褶長裙', 1580, 'skirt', 1880),
  product('coat', '羊毛大衣外套', 3680, 'coat'),
  product('cardigan', '奶茶色開襟外套', 1680, 'fashion'),
  product('set', '日常基本三件組', 2280, 'collection', 2680),
  product('shirt', '黑色寬版襯衫', 1380, 'creator'),
  product('portrait', '一字領針織衫', 1180, 'portrait'),
  product('jacket', '深藍工裝外套', 2480, 'collection'),
];

export const DEMO_CATEGORIES: DesignCategory[] = [
  { slug: 'demo-new', name: '新品上架', image: `${IMG}/fashion.webp` },
  { slug: 'demo-top', name: '上衣', image: `${IMG}/top.webp` },
  { slug: 'demo-skirt', name: '裙裝', image: `${IMG}/skirt.webp` },
  { slug: 'demo-coat', name: '外套', image: `${IMG}/coat.webp` },
];

export const DEMO_BANNERS: Banner[] = [
  { id: 'demo-b1', image: `${IMG}/fashion.webp`, link: '', title: '', active: true, sort_order: 0, group_no: 1 },
  { id: 'demo-b2', image: `${IMG}/creator.webp`, link: '', title: '', active: true, sort_order: 1, group_no: 1 },
];

export const DEMO_IMAGES = [`${IMG}/fashion.webp`, `${IMG}/portrait.webp`, `${IMG}/collection.webp`, `${IMG}/creator.webp`];

// 每種排版主視覺 / 圖文板塊用的示範圖(預設板塊沒有圖片,示意時補上)
const HERO: Record<string, string> = { classic: 'fashion', editorial: 'portrait', gallery: 'collection', campaign: 'creator' };
export function withDemoImages<T extends { type: string; image?: string }>(blocks: T[], style: string): T[] {
  return blocks.map((b) => (b.type === 'hero' && !b.image ? { ...b, image: `${IMG}/${HERO[style] ?? 'fashion'}.webp` }
    : b.type === 'imageText' && !b.image ? { ...b, image: `${IMG}/${style === 'classic' ? 'portrait' : 'fashion'}.webp` } : b));
}
