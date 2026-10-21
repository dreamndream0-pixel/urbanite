'use client';

import { useState, type CSSProperties } from 'react';
import CreditCard from './CreditCard';
import { MEMBERSHIP_BACKDROPS, membershipDesign, type MembershipDesignId } from '@/lib/membership-card';

export default function MemberRewardsHero({ heroImage = '' }: { heroImage?: string }) {
  const [designId, setDesignId] = useState<MembershipDesignId | null>(null);
  const design = designId ? membershipDesign(designId) : null;
  const headingStyle: CSSProperties | undefined = design ? { color: design.ink } : undefined;
  return <section data-rewards-hero={designId ?? 'classic'} className="relative -mx-4 -mt-8 overflow-hidden sm:-mx-6" style={{ backgroundColor: designId ? MEMBERSHIP_BACKDROPS[designId] : '#e9dfd0' }}>
    {!design ? <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] bg-[#e4d9c8] bg-cover bg-center" style={heroImage ? {
      backgroundImage: `url("${heroImage}")`, WebkitMaskImage: 'linear-gradient(to right, transparent, #000 42%)', maskImage: 'linear-gradient(to right, transparent, #000 42%)',
    } : { backgroundImage: 'linear-gradient(135deg, #d8cab9, #efe6d9 52%, #cdbba9)' }}>
      {heroImage ? null : <p className="font-script absolute right-6 top-8 text-right text-[34px] leading-[1.15] text-[#b0a08a] sm:text-[42px]">Good<br />Outfit<br />Brighter<br />Days.</p>}
    </div> : null}
    <div className="relative px-5 pb-5 pt-9 sm:px-8 sm:pb-7 sm:pt-11">
      <h2 className="font-serif-tc text-[34px] font-semibold leading-none text-[var(--c-text)] sm:text-[40px]" style={headingStyle}>我的優惠</h2>
      <p className="mt-3 text-[11px] text-[#a2957f] sm:text-xs" style={headingStyle}>MY COUPONS</p>
      <p className="mt-3.5 text-sm text-[var(--c-text2)] sm:text-base" style={headingStyle}>收藏喜歡的優惠，享受更好的購物體驗。</p>
      <CreditCard onDesignChange={setDesignId} />
    </div>
  </section>;
}
