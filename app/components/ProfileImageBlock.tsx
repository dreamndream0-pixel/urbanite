'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useLoopCarousel } from '@/app/components/useLoopCarousel';
import {
  blockItems,
  blockOptions,
  IMAGE_LAYOUTS,
  normalizeUrl,
  type BlockItem,
  type ImageLayout,
  type ProfileCardBlock,
} from '@/lib/profile-card';

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

type Colors = { textColor: string; mutedColor: string };

// 名片頁「圖文連結」:依版型顯示一張(多張時輪播)或多張排列
export default function ProfileImageBlock({
  block,
  radius,
  colors,
  onOpen,
}: {
  block: ProfileCardBlock;
  radius: number;
  colors: Colors;
  onOpen: () => void;
}) {
  const items = blockItems(block);
  const { layout, captionMode, autoplay } = blockOptions(block);
  const custom = captionMode === 'custom';
  const single = IMAGE_LAYOUTS.find((l) => l.key === layout)?.single ?? true;
  const r = Math.min(radius, 18);
  const href = (item: BlockItem) => normalizeUrl(custom && item.url ? item.url : block.url);
  const caption = (item: BlockItem) => (custom ? item.title : block.title);

  const frame: CSSProperties = { borderRadius: r, border: `1px solid ${tint(colors.textColor, 12)}`, background: 'rgba(255,255,255,0.85)' };

  if (single) {
    const slide = (item: BlockItem, multi: boolean) => {
      const text = caption(item);
      const aspect = layout === 'tall' ? 'aspect-[4/5]' : layout === 'square' ? 'aspect-square' : multi ? 'aspect-[16/9]' : 'h-auto';
      if (layout === 'card' || layout === 'card-right') {
        return (
          <TileLink href={href(item)} onOpen={onOpen} className={`flex h-full items-center gap-3 overflow-hidden p-2.5 ${layout === 'card-right' ? 'flex-row-reverse' : ''}`} style={frame}>
            <span className="aspect-square w-24 shrink-0 overflow-hidden" style={{ borderRadius: Math.max(r - 6, 2) }}>
              <Img src={item.image} className="h-full" />
            </span>
            <span className="line-clamp-3 min-w-0 flex-1 px-1 text-sm font-medium leading-5">{text}</span>
          </TileLink>
        );
      }
      if (layout === 'overlay') {
        return (
          <TileLink href={href(item)} onOpen={onOpen} className="relative h-full overflow-hidden" style={{ ...frame, background: undefined }}>
            <Img src={item.image} className={aspect} />
            {text ? (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-3 pt-10 text-sm font-medium leading-5 text-white">{text}</span>
            ) : null}
          </TileLink>
        );
      }
      const label = text ? <span className="block px-4 py-3 text-center text-sm font-medium leading-5">{text}</span> : null;
      return (
        <TileLink href={href(item)} onOpen={onOpen} className="h-full overflow-hidden" style={frame}>
          {layout === 'top' ? label : null}
          <Img src={item.image} className={aspect} />
          {layout !== 'top' ? label : null}
        </TileLink>
      );
    };
    if (items.length === 1) return slide(items[0], false);
    return <Carousel items={items} autoplay={autoplay} colors={colors} render={(item) => slide(item, true)} />;
  }

  // ---------- 多張排列 ----------
  const below = (item: BlockItem, center = false) =>
    custom && item.title ? <span className={`mt-1.5 line-clamp-2 block text-xs leading-4 ${center ? 'text-center' : ''}`}>{item.title}</span> : null;
  const overlayCaption = (item: BlockItem) =>
    custom && item.title ? (
      <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6 text-xs leading-4 text-white">{item.title}</span>
    ) : null;
  const tileStyle: CSSProperties = { borderRadius: r, border: `1px solid ${tint(colors.textColor, 10)}` };

  let body: ReactNode;
  if (layout === 'scroll') {
    body = (
      <div className="-mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, i) => (
          <TileLink key={i} href={href(item)} onOpen={onOpen} className="w-[42%] shrink-0 snap-start">
            <span className="block overflow-hidden" style={tileStyle}><Img src={item.image} className="aspect-[4/5]" /></span>
            {below(item)}
          </TileLink>
        ))}
      </div>
    );
  } else if (layout === 'mosaic' || layout === 'mosaic5') {
    const five = layout === 'mosaic5';
    const shown = items.slice(0, five ? 5 : 3);
    body = (
      <div className={`grid gap-1.5 ${five ? 'aspect-[2/1] grid-cols-4 grid-rows-2' : 'aspect-[3/2] grid-cols-2 grid-rows-2'}`}>
        {shown.map((item, i) => (
          <TileLink key={i} href={href(item)} onOpen={onOpen} className={`relative overflow-hidden ${i === 0 ? (five ? 'col-span-2 row-span-2' : 'row-span-2') : ''}`} style={tileStyle}>
            <Img src={item.image} className="h-full" />
            {overlayCaption(item)}
          </TileLink>
        ))}
      </div>
    );
  } else {
    const circle = layout === 'circle3';
    body = (
      <div className={`grid ${layout === 'grid2' ? 'grid-cols-2 gap-2.5' : circle ? 'grid-cols-3 gap-4 px-2' : 'grid-cols-3 gap-1.5'}`}>
        {items.map((item, i) => (
          <TileLink key={i} href={href(item)} onOpen={onOpen}>
            <span className={`block overflow-hidden ${circle ? 'rounded-full' : ''}`} style={circle ? { border: `1px solid ${tint(colors.textColor, 10)}` } : tileStyle}>
              <Img src={item.image} className="aspect-square" />
            </span>
            {below(item, circle)}
          </TileLink>
        ))}
      </div>
    );
  }
  return (
    <div>
      {body}
      {!custom && block.title ? (
        <a href={normalizeUrl(block.url)} target="_blank" rel="noreferrer" onClick={onOpen} className="mt-2 block text-center text-sm font-medium leading-5">
          {block.title}
        </a>
      ) : null}
    </div>
  );
}

function TileLink({ href, onOpen, className = '', style, children }: { href: string; onOpen: () => void; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onOpen} draggable={false} className={`block transition hover:opacity-90 ${className}`} style={style}>
      {children}
    </a>
  );
}

function Img({ src, className }: { src: string; className: string }) {
  return <img src={src} alt="" draggable={false} className={`block w-full bg-white object-cover ${className}`} />;
}

function Carousel({ items, autoplay, colors, render }: { items: BlockItem[]; autoplay: boolean; colors: Colors; render: (item: BlockItem) => ReactNode }) {
  const { slides, realIndex, go, trackProps } = useLoopCarousel(items, { autoplayMs: autoplay ? 4000 : 0 });
  return (
    <div>
      <div className="overflow-hidden">
        <div {...trackProps} className={`${trackProps.className} items-stretch`}>
          {slides.map((item, i) => (
            <div key={i} className="w-full shrink-0 px-px">{render(item)}</div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`第 ${i + 1} 張`}
            onClick={() => go(i)}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === realIndex ? 16 : 6, background: tint(colors.textColor, i === realIndex ? 60 : 20) }}
          />
        ))}
      </div>
    </div>
  );
}

// 後台版型選擇用的小示意圖
export function LayoutThumb({ layout }: { layout: ImageLayout }) {
  const box = 'rounded-[2px] bg-current opacity-25';
  const line = 'h-[3px] rounded-full bg-current opacity-50';
  switch (layout) {
    case 'banner': return <div className="w-full space-y-1"><div className={`${box} h-6`} /><div className={`${line} mx-auto w-2/3`} /></div>;
    case 'top': return <div className="w-full space-y-1"><div className={`${line} mx-auto w-2/3`} /><div className={`${box} h-6`} /></div>;
    case 'overlay': return <div className={`relative h-8 w-full ${box} opacity-30`}><div className="absolute bottom-1 left-1 h-[3px] w-1/2 rounded-full bg-current opacity-80" /></div>;
    case 'tall': return <div className={`${box} mx-auto h-8 w-[26px]`} />;
    case 'square': return <div className={`${box} mx-auto h-8 w-8`} />;
    case 'card': return <div className="flex w-full items-center gap-1"><div className={`${box} h-5 w-5 shrink-0`} /><div className="flex-1 space-y-1"><div className={line} /><div className={`${line} w-2/3`} /></div></div>;
    case 'card-right': return <div className="flex w-full items-center gap-1"><div className="flex-1 space-y-1"><div className={line} /><div className={`${line} w-2/3`} /></div><div className={`${box} h-5 w-5 shrink-0`} /></div>;
    case 'scroll': return <div className="flex w-full gap-1 overflow-hidden"><div className={`${box} h-7 w-[40%] shrink-0`} /><div className={`${box} h-7 w-[40%] shrink-0`} /><div className={`${box} h-7 w-[40%] shrink-0`} /></div>;
    case 'grid2': return <div className="grid w-full grid-cols-2 gap-1"><div className={`${box} aspect-square`} /><div className={`${box} aspect-square`} /></div>;
    case 'grid3': return <div className="grid w-full grid-cols-3 gap-0.5">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`${box} aspect-square`} />)}</div>;
    case 'circle3': return <div className="grid w-full grid-cols-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="aspect-square rounded-full bg-current opacity-25" />)}</div>;
    case 'mosaic': return <div className="grid h-8 w-full grid-cols-2 grid-rows-2 gap-0.5"><div className={`${box} row-span-2`} /><div className={box} /><div className={box} /></div>;
    case 'mosaic5': return <div className="grid h-7 w-full grid-cols-4 grid-rows-2 gap-0.5"><div className={`${box} col-span-2 row-span-2`} /><div className={box} /><div className={box} /><div className={box} /><div className={box} /></div>;
  }
}
