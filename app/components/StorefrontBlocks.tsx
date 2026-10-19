'use client';

import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import type { StorefrontBlock } from '@/lib/storefront-blocks';
import type { Banner, CategoryImageStyle, Product } from '@/lib/types';
import { isVisibleInStore } from '@/lib/product-status';
import type { DesignCategory } from './StorefrontDesign';
import styles from './storefront-blocks.module.css';
import CategoryNavigation from './CategoryNavigation';
import HeroCarousel from './HeroCarousel';
import { bannerRatioForGroup, type BannerRatios } from '@/lib/banner-ratio';

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
// 台灣時間 YYYY-MM-DDTHH:mm → 毫秒
function endTime(value: string) {
  const t = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(t) ? t : 0;
}
function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  const left = now === null ? 0 : Math.max(0, endTime(endsAt) - now);
  const parts = [Math.floor(left / 864e5), Math.floor(left / 36e5) % 24, Math.floor(left / 6e4) % 60, Math.floor(left / 1e3) % 60];
  return <div className={styles.timer} role="timer">
    {parts.map((value, i) => <span key={i} className={styles.timerUnit}>
      <b>{now === null ? '--' : String(value).padStart(2, '0')}</b><small>{['天', '時', '分', '秒'][i]}</small>
    </span>)}
  </div>;
}

export default function StorefrontBlocks({ blocks, products, categories, banners = [], bannerRatios, renderProduct, onCategory, onBrowseAll, preview = false, loading = false, designStyle = 'classic', categoryImageStyle = 'circle' }: {
  blocks: StorefrontBlock[]; products: Product[]; categories: DesignCategory[]; images?: string[]; banners?: Banner[];
  bannerRatios?: BannerRatios;
  renderProduct: (product: Product) => ReactNode; onCategory: (slug: string) => void; onBrowseAll?: () => void;
  preview?: boolean; loading?: boolean; designStyle?: string; categoryImageStyle?: CategoryImageStyle;
}) {
  const visible = blocks.filter((block) => block.visible);
  const firstProduct = visible.find((b) => b.type === 'products')?.id;
  const firstCarousel = visible.find((b) => b.type === 'carousel')?.id;
  const topCategories = categories.filter((c) => c.slug !== 'all' && !c.parent_id && (c.sort_order === undefined || c.sort_order >= 0));
  const style = styles[designStyle] ?? '';
  // 分類沒上傳圖片時,用該分類第一件商品的圖
  const categoryImage = (category: DesignCategory) => category.image || products.find((p) => p.category === category.slug && isVisibleInStore(p))?.image || '';
  // 連到 #store-products(或沒填連結)= 看全部商品
  const go = (href: string) => (event: MouseEvent) => {
    if (preview) { event.preventDefault(); return; }
    if (!href || href === '#store-products') { event.preventDefault(); onBrowseAll?.(); }
  };
  return <div className={`${styles.root} ${style}`} data-storefront-blocks data-storefront-style={designStyle}>
    {visible.map((block) => {
      // 不自動套用輪播圖:輪播圖常已有文字,會和模板標題疊在一起
      const image = block.image;
      const ratio = block.ratio === 'portrait' ? '4 / 5' : block.ratio === 'square' ? '1 / 1' : '16 / 9';
      const href = block.href || '#store-products';
      const sectionStyle = { background: block.background || undefined, color: foreground(block.background), paddingBlock: block.spacing, '--block-columns': block.columns, '--block-ratio': ratio } as CSSProperties;
      return <section key={block.id} id={block.id === firstProduct && !preview ? 'store-products' : undefined} data-block-id={block.id} data-block-type={block.type} className={`${styles.block} ${styles[`type_${block.type}`] ?? ''}`} style={sectionStyle}>
        {block.type === 'hero' && <div className={styles.heroFrame}>
          <div className={`${styles.hero} ${image ? styles.withImage : ''}`} data-pos={block.copyPos} style={{ alignItems: { t: 'flex-start', m: 'center', b: 'flex-end' }[block.copyPos[0]], justifyContent: { l: 'flex-start', c: 'center', r: 'flex-end' }[block.copyPos[1]], textAlign: ({ l: 'left', c: 'center', r: 'right' } as const)[block.copyPos[1] as 'l' | 'c' | 'r'] }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image && <img src={image} alt="" className={styles.cover} />}
            <div className={styles.heroCopy}>
              {block.title && <h1 className={styles.serif}>{block.title}</h1>}
              {block.text && <p className={styles.heroText}>{block.text}</p>}
              {block.action && <a href={href} onClick={go(block.href)} className={styles.pill} style={image ? { background: `rgb(255 255 255 / ${block.buttonOpacity}%)`, color: block.buttonOpacity >= 60 ? "#1f1b19" : "#fff" } : undefined}>{block.action}<ArrowRight size={16} /></a>}
            </div>
          </div>
        </div>}

        {block.type === 'categories' && <div className={styles.inner}>
          {block.title && <h2 className={styles.heading}>{block.title}</h2>}
          {designStyle === 'gallery' ? <nav className={styles.masonry} aria-label={block.title || '商品分類'}>
            {topCategories.map((category) => <button type="button" key={category.slug} className={styles.tile} onClick={() => onCategory(category.slug)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {categoryImage(category) && <img src={categoryImage(category)} alt="" className={styles.cover} />}
              <span className={styles.serif}>{category.name}</span>
            </button>)}
          </nav> : designStyle === 'category' ? <nav className={styles.cards} aria-label={block.title || '商品分類'}>
            {topCategories.map((category) => <button type="button" key={category.slug} className={styles.card} onClick={() => onCategory(category.slug)}>
              {categoryImage(category) && categoryImageStyle !== 'text' && <span className={`${styles.cardImage} ${categoryImageStyle === 'circle' ? styles.cardCircle : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={categoryImage(category)} alt="" className={categoryImageStyle === 'cutout' ? styles.cutout : ''} />
              </span>}
              <span className={styles.cardName}>{category.name}</span>
            </button>)}
          </nav> : <div className={styles.categoryStrip}>
            {/* 和首頁分類列一致:「全部商品」放最右邊 */}
            <CategoryNavigation categories={[...topCategories, { slug: 'all', name: '全部商品' }]} value="" onSelect={onCategory} imageStyle={categoryImageStyle} />
          </div>}
        </div>}

        {block.type === 'products' && <div className={styles.inner}>
          {block.title && <div className={styles.sectionHead}>
            <h2 className={styles.heading}>{block.title}</h2>
            {designStyle !== 'editorial' && <button type="button" className={styles.more} onClick={() => !preview && onBrowseAll?.()}>查看更多<ChevronRight size={16} /></button>}
          </div>}
          {loading ? <p role="status" className={styles.empty}>商品載入中...</p>
            : blockProducts(block, products).length ? <div className={styles.grid}>{blockProducts(block, products).map((p) => <div key={p.id} className={styles.product}>{renderProduct(p)}</div>)}</div>
            : <p className={styles.empty}>目前沒有可顯示的商品。</p>}
        </div>}

        {block.type === 'imageText' && <div className={styles.inner}>
          <a href={href} onClick={go(block.href)} className={`${styles.banner} ${image ? styles.withImage : ''}`} aria-label={block.title || block.action || '看更多'}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image && <img src={image} alt="" className={styles.cover} />}
            <span className={styles.bannerCopy}>
              {block.title && <strong className={styles.serif}>{block.title}</strong>}
              {block.text && <span>{block.text}</span>}
            </span>
            <span className={styles.arrow} aria-hidden="true"><ArrowRight size={18} /></span>
          </a>
        </div>}

        {block.type === 'carousel' && (() => {
          const slides = banners.filter((b) => b.active && (b.group_no ?? 1) === block.group);
          return slides.length ? <div className={styles.carousel}><HeroCarousel banners={slides} ratio={bannerRatioForGroup(bannerRatios, block.group, block.carouselRatio)} priority={!preview && block.id === firstCarousel} /></div>
            : preview ? <div className={styles.inner}><p className={styles.empty}>輪播圖{block.group} 還沒有圖片,請到「系統設定 → 輪播圖」上傳</p></div> : null;
        })()}

        {block.type === 'countdown' && <div className={styles.inner}>
          <div className={styles.countdown}>
            {block.title && <h2 className={styles.heading}>{block.title}</h2>}
            {block.endsAt ? <Countdown endsAt={block.endsAt} /> : preview ? <p className={styles.empty}>尚未設定結束時間</p> : null}
            {block.text && <p className={styles.text}>{block.text}</p>}
          </div>
        </div>}

        {block.type === 'announcement' && <div className={styles.inner}>
          <div className={styles.announcement}>
            {block.title && <h2 className={`${styles.heading} ${styles.serif}`}>{block.title}</h2>}
            {block.text && <p className={styles.text}>{block.text}</p>}
            {block.action && <a href={href} onClick={go(block.href)} className={styles.pill}>{block.action}<ArrowRight size={16} /></a>}
          </div>
        </div>}

        {block.type === 'video' && <div className={styles.inner}>
          {block.title && <h2 className={styles.heading}>{block.title}</h2>}
          {block.video ? <video src={block.video} poster={image || undefined} controls playsInline preload="metadata" className={styles.video} aria-label={block.title || '品牌影片'} />
            : preview ? <p className={styles.empty}>尚未設定影片網址</p> : null}
          {block.text && <p className={styles.text}>{block.text}</p>}
        </div>}
      </section>;
    })}
    {preview && visible.length === 0 && <p className={styles.empty}>尚無可見板塊</p>}
  </div>;
}
