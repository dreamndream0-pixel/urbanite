'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { StorefrontBlock } from '@/lib/storefront-blocks';
import type { Product } from '@/lib/types';
import { isVisibleInStore } from '@/lib/product-status';
import type { DesignCategory } from './StorefrontDesign';
import styles from './storefront-blocks.module.css';
import CategoryNavigation from './CategoryNavigation';

export function blockProducts(block: StorefrontBlock, products: Product[]) {
  const live = products.filter(isVisibleInStore);
  const selected = block.source === 'selected' ? block.productIds.flatMap((id) => live.find((p) => p.id === id) ?? []) : block.source === 'category' ? live.filter((p) => p.category === block.category) : live;
  return selected.slice(0, block.limit);
}
function foreground(background: string) {
  if (!background) return undefined;
  const values = background.slice(1).match(/../g)!.map((v) => parseInt(v, 16));
  return values[0] * .299 + values[1] * .587 + values[2] * .114 < 145 ? '#ffffff' : '#191919';
}
export default function StorefrontBlocks({ blocks, products, categories, images = [], renderProduct, onCategory, preview = false, loading = false, designStyle, categoryImageStyle = 'circle' }: {
  blocks: StorefrontBlock[]; products: Product[]; categories: DesignCategory[]; images?: string[];
  renderProduct: (product: Product) => ReactNode; onCategory: (slug: string) => void; preview?: boolean; loading?: boolean;
  designStyle?: string; categoryImageStyle?: 'circle' | 'square' | 'cutout';
}) {
  const visible = blocks.filter((block) => block.visible);
  const firstProduct = visible.find((b) => b.type === 'products')?.id;
  return <div className={styles.root} data-storefront-blocks>
    {visible.map((block) => {
      const image = block.image || (block.type === 'hero' ? images[0] : block.type === 'imageText' ? images[1] : '');
      const ratio = block.ratio === 'portrait' ? '4 / 5' : block.ratio === 'square' ? '1 / 1' : '16 / 9';
      const action = block.action && block.href ? <a href={block.href} onClick={preview ? (e) => e.preventDefault() : undefined} className={styles.action}>{block.action}<ArrowRight size={18} /></a> : null;
      return <section key={block.id} id={block.id === firstProduct ? (preview ? undefined : 'store-products') : undefined} data-block-id={block.id} data-block-type={block.type} className={styles.block} style={{ background: block.background || undefined, color: foreground(block.background), paddingBlock: block.spacing, '--block-columns': block.columns, '--block-mobile-columns': Math.min(2, block.columns), '--block-ratio': ratio } as CSSProperties}>
        {block.type === 'hero' ? <div className={`${styles.hero} ${image ? styles.withImage : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <img src={image} alt="" className={styles.heroImage} />}
          <div className={styles.heroCopy}><h1>{block.title}</h1><p>{block.text}</p>{action}</div>
        </div> : <div className={styles.inner}>
          {block.title && <h2>{block.title}</h2>}
          {block.text && <p className={styles.text}>{block.text}</p>}
          {block.type === 'products' && <>{loading ? <p role="status">商品載入中...</p> : blockProducts(block, products).length ? <div className={styles.grid}>{blockProducts(block, products).map((p) => <div key={p.id} className={styles.product}>{renderProduct(p)}</div>)}</div> : <p className={styles.empty}>目前沒有可顯示的商品。</p>}</>}
          {block.type === 'categories' && (designStyle === 'classic' ? <div className={styles.categoryStrip}><CategoryNavigation categories={[{ slug: 'all', name: '全部商品' }, ...categories.filter((c) => c.slug !== 'all' && !c.parent_id && (c.sort_order === undefined || c.sort_order >= 0))]} value="all" onSelect={onCategory} imageStyle={block.categoryImageStyle ?? categoryImageStyle} /></div> : <nav className={styles.grid} aria-label={block.title || '商品分類'}>{categories.filter((c) => !c.parent_id && (c.sort_order === undefined || c.sort_order >= 0)).map((category) => <button type="button" key={category.slug} className={styles.category} onClick={() => onCategory(category.slug)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {category.image && <img src={category.image} alt="" />}<span>{category.name}<ArrowRight size={18} /></span>
          </button>)}</nav>)}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {block.type === 'imageText' && image && <img src={image} alt={block.title} className={styles.featureImage} />}
          {block.type === 'video' && block.video && <video src={block.video} poster={image || undefined} controls playsInline preload="metadata" className={styles.video} aria-label={block.title || '品牌影片'} />}
          {block.type === 'video' && !block.video && preview && <p className={styles.empty}>尚未設定影片網址</p>}
          {action}
        </div>}
      </section>;
    })}
    {preview && visible.length === 0 && <p className={styles.empty}>尚無可見板塊</p>}
  </div>;
}
