'use client';

import { useEffect, useRef, useState } from 'react';
import ProfileCardView, { type CardProduct } from '@/app/components/ProfileCardView';
import type { ProfileCard, ProfileCardBlock } from '@/lib/profile-card';

// 介紹頁的範例手機:依外框寬度縮放名片畫面
export default function DemoPhone({ card, blocks, products = {}, lineUrl = '' }: { card: ProfileCard; blocks: ProfileCardBlock[]; products?: Record<string, CardProduct>; lineUrl?: string }) {
  const WIDTH = 360;
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.offsetWidth / WIDTH || 0.5);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="pointer-events-none relative aspect-[9/18] overflow-hidden" aria-hidden="true">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: WIDTH, height: `${100 / scale}%`, transform: `scale(${scale})` }}>
        <ProfileCardView card={card} blocks={blocks} products={products} lineUrl={lineUrl} preview />
      </div>
    </div>
  );
}
