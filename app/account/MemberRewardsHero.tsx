'use client';

import { useState } from 'react';
import CreditCard from './CreditCard';
import { MEMBERSHIP_BACKDROPS, type MembershipDesignId } from '@/lib/membership-card';

export default function MemberRewardsHero({ heroImage = '' }: { heroImage?: string }) {
  const [designId, setDesignId] = useState<MembershipDesignId | null>(null);
  return <section data-rewards-hero={designId ?? 'classic'} className="relative -mx-4 -mt-8 overflow-hidden sm:-mx-6" style={{ backgroundColor: designId ? MEMBERSHIP_BACKDROPS[designId] : '#e9dfd0' }}>
    {!designId ? <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] bg-[#e4d9c8] bg-cover bg-center" style={heroImage ? {
      backgroundImage: `url("${heroImage}")`, WebkitMaskImage: 'linear-gradient(to right, transparent, #000 42%)', maskImage: 'linear-gradient(to right, transparent, #000 42%)',
    } : { backgroundImage: 'linear-gradient(135deg, #d8cab9, #efe6d9 52%, #cdbba9)' }} /> : null}
    <div className="relative px-5 pb-5 pt-3 sm:px-8 sm:pb-7 sm:pt-4">
      <CreditCard onDesignChange={setDesignId} />
    </div>
  </section>;
}
