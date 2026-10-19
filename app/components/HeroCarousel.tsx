'use client';

import type { Banner } from '@/lib/types';
import { useLoopCarousel } from '@/app/components/useLoopCarousel';
import Image from 'next/image';
import { canOptimizeStoreImage } from '@/lib/store-image';

// 首頁輪播:自動播放、可左右滑動(原本首頁與模板的輪播板塊共用)
// ratio:固定比例(促銷活動頁可選);沒給時沿用首頁的響應式比例
const RATIO_CLASS = { portrait: 'aspect-[4/5]', square: 'aspect-square', wide: 'aspect-[16/9]' } as const;
const RATIO_WIDTH = { portrait: 'sm:mx-auto sm:max-w-lg', square: 'sm:mx-auto sm:max-w-2xl', wide: '' } as const;

export default function HeroCarousel({ banners, ratio, priority = true }: { banners: Banner[]; ratio?: keyof typeof RATIO_CLASS; priority?: boolean }) {
  const { slides, realIndex, realOf, step, go, trackProps } = useLoopCarousel(banners, { autoplayMs: 4000 });
  const count = banners.length;
  if (count === 0) return null;

  return (
    <section aria-label="首頁輪播" className={`group relative w-full select-none overflow-hidden bg-[var(--c-border)] ${ratio ? RATIO_WIDTH[ratio] : ''}`}>
      <div {...trackProps} className={`${trackProps.className} items-start`}>
        {slides.map((banner, i) => {
          // 副本與真實張共用同一個「真實序號」,換回真實張時樣式不會閃動
          const active = realOf(i) === realIndex;
          const firstSlide = i === (count > 1 ? 1 : 0);
          const img = (
            <Image
              src={banner.image}
              alt={banner.title || '輪播圖'}
              fill
              sizes={ratio === 'portrait' ? '(min-width: 640px) 512px, 100vw' : ratio === 'square' ? '(min-width: 640px) 672px, 100vw' : '100vw'}
              unoptimized={!canOptimizeStoreImage(banner.image)}
              loading={priority && firstSlide ? 'eager' : 'lazy'}
              fetchPriority={priority && firstSlide ? 'high' : 'low'}
              draggable={false}
              // 固定框架,圖片放大縮小填滿整個輪播框(適配版面大小)
              className={`pointer-events-none h-full w-full object-cover object-center transition-[opacity,transform,filter] duration-700 ease-out ${
                active ? 'scale-100 opacity-100 blur-0' : 'scale-[1.035] opacity-75 blur-[1px]'
              }`}
            />
          );
          return (
            <div
              key={`${banner.id}-${i}`}
              className={`relative w-full shrink-0 bg-[var(--c-border)] ${ratio ? RATIO_CLASS[ratio] : 'aspect-[4/5] sm:aspect-[16/7] lg:aspect-[16/5]'}`}
            >
              {banner.link ? (
                <a href={banner.link} target="_blank" rel="noreferrer" className="absolute inset-0 block">
                  {img}
                </a>
              ) : (
                img
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => step(-1)}
            aria-label="上一張"
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white opacity-0 transition group-hover:opacity-100 sm:flex"
          >
            <IconChevron dir="left" />
          </button>
          <button
            onClick={() => step(1)}
            aria-label="下一張"
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white opacity-0 transition group-hover:opacity-100 sm:flex"
          >
            <IconChevron dir="right" />
          </button>
          <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                onClick={() => go(i)}
                aria-label={`第 ${i + 1} 張`}
                className={`h-2 rounded-full border border-white/80 transition-all ${
                  i === realIndex ? 'w-2 bg-[var(--c-surface)]' : 'w-2 bg-transparent hover:bg-[var(--c-surface)]/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
