'use client';

import { useRef } from 'react';

export type ShowcaseItem = { key: string; label: string; image: string; href: string };

// 作品案例:名片截圖,左右滑動(桌機有左右箭頭)
export default function ShowcaseCarousel({ items }: { items: ShowcaseItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  const arrow = 'hidden h-9 w-9 items-center justify-center rounded-full border border-[#e3e0da] bg-white text-[#1f1b19] shadow-sm transition hover:bg-[#f4f3f0] sm:flex';

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.25em] text-[#a8a29b]">SHOWCASE</p>
          <p className="mt-1 text-lg font-black">作品案例</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#a8a29b] sm:hidden">左右滑動看更多 →</span>
          <button type="button" onClick={() => scroll(-1)} aria-label="上一個" className={arrow}>←</button>
          <button type="button" onClick={() => scroll(1)} aria-label="下一個" className={arrow}>→</button>
        </div>
      </div>
      <div
        ref={ref}
        className="-mx-4 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-6 pt-2 [scrollbar-width:none] sm:mx-0 sm:px-1 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <a key={item.key} href={item.href} target="_blank" rel="noreferrer" className="w-[44%] max-w-[200px] shrink-0 snap-start sm:w-[190px]">
            <span className="block overflow-hidden rounded-[24px] border-[5px] border-[#1f1b19] bg-white shadow-[0_16px_32px_rgba(31,27,25,0.16)]">
              <img src={item.image} alt={`${item.label} 樣板範例`} loading={i < 3 ? 'eager' : 'lazy'} className="block aspect-[390/844] w-full object-cover object-top" />
            </span>
            <span className="mt-2.5 block text-center text-xs text-[#55504a]">{item.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
