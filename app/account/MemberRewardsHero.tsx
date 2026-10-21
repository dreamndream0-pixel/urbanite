'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CreditCard, { type MemberCredit } from './CreditCard';
import { MEMBERSHIP_BACKDROPS, membershipDesign } from '@/lib/membership-card';

export default function MemberRewardsHero({ heroImage = '' }: { heroImage?: string }) {
  const [data, setData] = useState<MemberCredit | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Theme and card share one response, so an unfinished read is never a classic card.
  useEffect(() => {
    let controller: AbortController | null = null;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const response = await fetch('/api/me/credit', { cache: 'no-store', signal });
        if (signal.aborted) return;
        if (response.status === 401 || response.status === 403) setData(null);
        if (!response.ok) throw new Error('Credit read failed');
        const value = await response.json();
        if (!value || typeof value.enabled !== 'boolean' || (value.enabled && (
          !value.tier || !Array.isArray(value.rules?.tiers) || !Array.isArray(value.entries) || !Number.isFinite(value.balance)
        ))) throw new Error('Invalid credit response');
        if (!signal.aborted) { setData(value); setFailed(false); }
      } catch {
        if (!signal.aborted) setFailed(true);
      }
    };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('loyalty-settings-updated', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('loyalty-settings-updated', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [attempt]);
  if (data?.enabled === false) return null;
  const designId = data?.enabled && data.card?.settings?.enabled ? membershipDesign(data.tier.cardDesign).id : null;
  const mode = data ? designId ?? 'classic' : failed ? 'error' : 'loading';
  return <section data-rewards-hero={mode} aria-busy={!data && !failed} className="relative -mx-4 -mt-8 overflow-hidden sm:-mx-6" style={{ backgroundColor: designId ? MEMBERSHIP_BACKDROPS[designId] : data ? '#e9dfd0' : 'var(--c-bg, #f4f4f5)' }}>
    {data && !designId ? <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] bg-[#e4d9c8] bg-cover bg-center" style={heroImage ? {
      backgroundImage: `url("${heroImage}")`, WebkitMaskImage: 'linear-gradient(to right, transparent, #000 42%)', maskImage: 'linear-gradient(to right, transparent, #000 42%)',
    } : { backgroundImage: 'linear-gradient(135deg, #d8cab9, #efe6d9 52%, #cdbba9)' }} /> : null}
    <div className="relative px-5 pb-5 pt-3 sm:px-8 sm:pb-7 sm:pt-4">
      {data ? <CreditCard data={data} /> : <div data-credit-placeholder className="mx-auto flex aspect-[4/3] w-full max-w-[760px] items-center justify-center gap-3 rounded-lg bg-[var(--c-surface)]/35" role="status">
        {failed ? <><span className="text-sm text-[var(--c-text2)]">暫時無法載入會員卡</span><button type="button" title="重新載入會員卡" aria-label="重新載入會員卡" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }} className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--c-text)]"><RefreshCw size={18} /></button></> : <span className="sr-only">載入會員卡中</span>}
      </div>}
    </div>
  </section>;
}
