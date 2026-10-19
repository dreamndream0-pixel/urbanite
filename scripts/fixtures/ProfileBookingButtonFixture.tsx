'use client';

import { useEffect, useState } from 'react';
import ProfileCardManager from '@/app/admin/ProfileCardManager';
import ProfileCardView from '@/app/components/ProfileCardView';
import type { ProfileCard, ProfileCardBlock } from '@/lib/profile-card';

// Temporary local route only; tests mock profile reads and writes.
export default function ProfileBookingButtonFixture({ mode = '' }: { mode?: string }) {
  const [data, setData] = useState<{ card: ProfileCard; blocks: ProfileCardBlock[]; bookingHref: string } | null>(null);
  useEffect(() => {
    if (mode === 'public') void fetch('/api/profile-card').then((r) => r.json()).then(setData);
  }, [mode]);
  return <main className="mx-auto max-w-6xl p-4">
    {mode === 'public' ? data ? <ProfileCardView card={data.card} blocks={data.blocks} bookingHref={data.bookingHref} products={{}} fullScreen /> : 'Loading'
      : <ProfileCardManager products={[]} />}
  </main>;
}
