'use client';

import { ArrowRight } from 'lucide-react';
import type { StorefrontDesign as Design } from '@/lib/storefront-template';
import styles from './storefront-design.module.css';

export type DesignCategory = { slug: string; name: string; image?: string; parent_id?: string | null; sort_order?: number };
type Props = { design: Design; image?: string; categories: DesignCategory[]; onCategory: (slug: string) => void; onBrowse: () => void };

export function StorefrontDesignHero({ design, image, categories, onCategory, onBrowse }: Props) {
  return (
    <div className={`${styles.design} ${styles[design.style]}`} data-storefront-style={design.style}>
      <section className={`${styles.hero} ${!image ? styles.noImage : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="" className={styles.heroImage} />}
        <div className={styles.copy}>
          {design.title && <h1>{design.title}</h1>}
          {design.subtitle && <p>{design.subtitle}</p>}
          {design.action && <button type="button" onClick={onBrowse}>{design.action}<ArrowRight size={18} /></button>}
        </div>
      </section>
      {design.style === 'gallery' && categories.length > 0 && (
        <nav className={styles.categories} aria-label="精選商品分類">
          {categories.slice(0, 6).map((category) => (
            <button type="button" key={category.slug} onClick={() => onCategory(category.slug)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {category.image && <img src={category.image} alt="" />}
              <span>{category.name}<ArrowRight size={18} /></span>
            </button>
          ))}
        </nav>
      )}
      {design.style === 'campaign' && (design.featureTitle || design.featureText) && (
        <section className={styles.campaignNote}><h2>{design.featureTitle}</h2><p>{design.featureText}</p></section>
      )}
    </div>
  );
}

export function StorefrontDesignFeature({ design, image, onBrowse }: { design: Design; image?: string; onBrowse: () => void }) {
  if (design.style === 'campaign' || (!design.featureTitle && !design.featureText)) return null;
  return (
    <section className={`${styles.feature} ${styles[design.style]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} alt="" />}
      <div><h2>{design.featureTitle}</h2><p>{design.featureText}</p>
        {design.action && <button type="button" onClick={onBrowse}>{design.action}<ArrowRight size={18} /></button>}
      </div>
    </section>
  );
}
