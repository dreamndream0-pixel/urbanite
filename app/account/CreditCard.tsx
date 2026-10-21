'use client';

import { useId, useState } from 'react';
import MembershipCard from '@/app/components/MembershipCard';
import type { LoyaltyTier } from '@/lib/loyalty-settings';
import type { MembershipCardSettings } from '@/lib/membership-card';

type Entry = { id: number; kind: string; amount: number; note: string; created_at: string };
type Tier = LoyaltyTier;
export type MemberCredit = { enabled: false } | {
  enabled: true; balance: number; pending: number; expiringSoon: number; nextAvailableAt: string | null; entries: Entry[];
  tier: Tier; next: Tier | null; spend: number; toNext: number; keptUntil: string | null;
  rules: { tiers: Tier[]; delayDays: number; validDays: number; maxRedeemPct: number; keepMonths: number };
  card?: { settings: MembershipCardSettings; brandName: string; memberName: string };
};

const money = (n: number) => `NT$${Math.round(n).toLocaleString('en-US')}`;
const KIND_LABEL: Record<string, string> = { earn: '訂單回饋入帳', redeem: '結帳折抵', return: '退回', expire: '到期', clawback: '退款追回', adjust: '調整' };

// 會員中心「我的優惠」:回饋金卡(可用、待入帳、即將到期)+ 會員等級與明細
export default function CreditCard({ data }: { data: MemberCredit }) {
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(0);
  const detailsId = useId();
  function toggleDetails() {
    if (!enabled) return;
    if (!open) setReveal((value) => value + 1);
    setOpen((value) => !value);
  }
  const enabled = data.enabled === true;
  if (!enabled) return null;
  const imageCard = data.card?.settings?.enabled === true;
  const sub = data.pending > 0 ? `待入帳 ${money(data.pending)}${data.nextAvailableAt ? `,${new Date(data.nextAvailableAt).toLocaleDateString('zh-TW')} 起可用` : ''}`
    : data.expiringSoon > 0 ? `${money(data.expiringSoon)} 將在 30 天內到期`
    : data.balance > 0 ? '結帳時可折抵,1 元抵 NT$1。' : '訂單完成後依會員等級累積回饋金。';
  return (
    <div>
      {imageCard && data.card ? <MembershipCard tier={data.tier} next={data.next} spend={data.spend} toNext={data.toNext} memberName={data.card.memberName} brandName={data.card.brandName} settings={data.card.settings} periodMonths={data.rules.keepMonths} credit={{ balance: data.balance, status: sub }} immersive onAction={toggleDetails} expanded={open} detailsId={detailsId} animate revealKey={reveal} /> : null}
      <div className={imageCard ? 'text-[var(--c-text)]' : 'rounded-[22px] bg-[var(--c-surface)]/55 shadow-[0_8px_24px_rgba(64,52,43,0.06)] backdrop-blur-[2px]'}>
      {!imageCard ? <button type="button" onClick={toggleDetails} aria-expanded={open} aria-controls={enabled ? detailsId : undefined} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--c-surface)]/60 text-[var(--c-text2)]">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7S9 3 6.5 4.5 8 9 12 7zM12 7s3-4 5.5-2.5S16 9 12 7z" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-base font-medium text-[#5f564b]">
            回饋金
            {enabled ? <span className="rounded-full bg-[#efe4d2] px-2 py-0.5 text-[11px] font-semibold text-[#8a6a3c]">{data.tier.name}・回饋 {data.tier.rate}%</span> : null}
          </p>
          <p className="flex items-center gap-2 text-[34px] font-bold leading-tight text-[var(--c-text)]">
            {money(data.balance)}
            {enabled ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#a2957f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? 'rotate-90 transition' : 'transition'}><path d="M9 6l6 6-6 6" /></svg> : null}
          </p>
          <p className="mt-1 text-xs text-[#7d7264] sm:text-sm">{sub}</p>
        </div>
      </button> : null}
      {enabled && open ? (
        <div id={detailsId} role="region" aria-label="回饋金與會員明細" className={`space-y-4 border-t border-[#e6dccd] px-4 pb-4 pt-3 sm:px-5 ${imageCard ? 'bg-[var(--c-surface)]' : ''}`}>
          {imageCard ? <div className="grid grid-cols-3 gap-3 border-b border-[var(--c-border)] pb-3 text-xs">
            {[['可用', data.balance], ['待入帳', data.pending], ['30 天內到期', data.expiringSoon]].map(([label, value]) => <div key={String(label)}><p className="text-[var(--c-text2)]">{label}</p><p className="mt-1 font-semibold">{money(Number(value))}</p></div>)}
          </div> : null}
          <div>
            <p className="text-sm font-semibold text-[var(--c-text)]">會員等級</p>
            <p className="mt-1 text-xs text-[var(--c-text2)]">近 {data.rules.keepMonths} 個月有效消費 {money(data.spend)}{data.next ? `,再消費 ${money(data.toNext)} 升級「${data.next.name}」(回饋 ${data.next.rate}%)` : ',已是最高等級'}</p>
            {data.next ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6dccd]">
                <div className="h-full rounded-full bg-[var(--c-brand)]" style={{ width: `${Math.min(100, Math.round((data.spend / Math.max(1, data.next.threshold)) * 100))}%` }} />
              </div>
            ) : null}
            {data.keptUntil ? <p className="mt-1 text-[11px] text-[var(--c-muted)]">保級至 {new Date(data.keptUntil).toLocaleDateString('zh-TW')}</p> : null}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {data.rules.tiers.map((t) => (
                <span key={t.key} className={`rounded-full px-2 py-0.5 ${t.key === data.tier.key ? 'bg-[var(--c-brand)] text-white' : 'bg-[#efe8dd] text-[var(--c-text2)]'}`}>{t.name} {t.threshold ? `${money(t.threshold)} 起` : ''}・{t.rate}%</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--c-text)]">回饋金明細</p>
            {data.entries.length === 0 ? <p className="mt-2 text-xs text-[var(--c-muted)]">尚無紀錄</p> : (
              <div className="mt-1 divide-y divide-[#e6dccd] text-sm">
                {data.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><p>{KIND_LABEL[e.kind] ?? e.kind}</p><p className="truncate text-[11px] text-[var(--c-muted)]">{new Date(e.created_at).toLocaleDateString('zh-TW')}{e.note && e.kind === 'adjust' ? `・${e.note}` : ''}</p></div>
                    <span className={`shrink-0 font-semibold ${e.amount >= 0 ? 'text-[#1f7a44]' : 'text-[#9a4d42]'}`}>{e.amount >= 0 ? '+' : ''}{money(e.amount).replace('NT$-', '-NT$')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] leading-5 text-[var(--c-muted)]">訂單完成 {data.rules.delayDays} 天後入帳,入帳後 {data.rules.validDays} 天內有效;結帳每筆最多折抵商品金額 {data.rules.maxRedeemPct}%,運費不可折抵。</p>
        </div>
      ) : null}
      </div>
    </div>
  );
}
