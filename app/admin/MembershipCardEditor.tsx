'use client';

import Image from 'next/image';
import { useEffect, useId, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Upload, X } from 'lucide-react';
import MembershipCard from '@/app/components/MembershipCard';
import { nextTier, resolveLoyalty, type LoyaltySettings, type LoyaltyTier } from '@/lib/loyalty-settings';
import { MEMBERSHIP_DESIGNS, MEMBERSHIP_ICONS, membershipBenefitLabel, membershipDesign, resolveMembershipBenefits, resolveMembershipCard, type MembershipBenefit, type MembershipDesignId } from '@/lib/membership-card';

const field = 'w-full min-w-0 rounded-lg border border-[#dedbd5] bg-white px-3 py-2 text-base sm:text-sm';
const PREVIEW_AMOUNT = 10000;
type Props = { tierKey: string; ownerName: string; settings: LoyaltySettings; onChange: (update: (settings: LoyaltySettings) => LoyaltySettings) => void; onBusyChange: (busy: boolean) => void };

export default function MembershipCardEditor({ tierKey, ownerName, settings, onChange, onBusyChange }: Props) {
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState('');
  const normalized = resolveLoyalty(settings);
  const draftTier = settings.tiers.find((tier) => tier.key === tierKey);
  const tier = normalized.tiers.find((tier) => tier.key === tierKey) ?? normalized.tiers[0];
  const next = nextTier(normalized, tier);
  const card = resolveMembershipCard(settings.card);
  const benefits = resolveMembershipBenefits(tier.benefits);
  const changeTier = (patch: Partial<LoyaltyTier>) => onChange((s) => ({ ...s, tiers: s.tiers.map((t) => t.key === tier.key ? { ...t, ...patch } : t) }));
  const changeBenefit = (index: number, patch: Partial<MembershipBenefit>) => onChange((s) => ({ ...s, tiers: s.tiers.map((t) => t.key === tier.key ? { ...t, benefits: resolveMembershipBenefits(t.benefits).map((b, i) => i === index ? { ...b, ...patch } : b) } : t) }));
  async function upload(file: File, index: number) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('請選擇 5MB 以下的 PNG、JPG、WebP 或 GIF 圖片'); return; }
    const targetKey = tier.key;
    setUploading(index); onBusyChange(true); setError('');
    try {
      const form = new FormData(); form.set('file', file); form.set('folder', 'membership-icons'); form.set('productId', `membership-${targetKey}`);
      const response = await fetch('/api/products/image', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok || !data.image_url) throw new Error(data.error || '圖示上傳失敗');
      onChange((s) => ({ ...s, tiers: s.tiers.map((t) => t.key === targetKey ? { ...t, benefits: resolveMembershipBenefits(t.benefits).map((b, i) => i === index ? { ...b, image: data.image_url } : b) } : t) }));
    } catch (e) { setError(e instanceof Error ? e.message : '圖示上傳失敗'); }
    finally { setUploading(null); onBusyChange(false); }
  }
  return <section className="border-t border-[#e5ded4] bg-white py-4" aria-label="會員卡樣式設定">
    <fieldset disabled={uploading !== null} className="min-w-0 space-y-5 disabled:opacity-70">
      <label className="flex items-center justify-between gap-3"><span className="font-semibold">圖片會員卡</span><input aria-label="啟用圖片會員卡" type="checkbox" checked={card.enabled} onChange={(e) => onChange((s) => ({ ...s, card: { ...resolveMembershipCard(s.card), enabled: e.target.checked } }))} className="h-5 w-5 accent-[#1f1b19]" /></label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        {([['title', '權益區標題', 24], ['intro', '會員副標語', 40], ['subtitle', '卡片標語', 40], ['actionLabel', '按鈕文字', 12]] as const).map(([key, label, max]) => <label key={key} className="min-w-0 text-sm">{label}<input aria-label={label} maxLength={max} value={settings.card?.[key] ?? card[key] ?? ''} onChange={(e) => onChange((s) => ({ ...s, card: { ...resolveMembershipCard(s.card), [key]: e.target.value } }))} className={`${field} mt-1`} /></label>)}
      </div>
      <label className="block text-sm">累積消費門檻週期(月)<input aria-label="累積消費門檻週期(月)" type="number" inputMode="numeric" min={1} max={36} value={settings.keepMonths} onChange={(e) => onChange((s) => ({ ...s, keepMonths: Number(e.target.value) }))} className={`${field} mt-1`} /></label>
      <DesignPicker selected={membershipDesign(tier.cardDesign).id} onSelect={(cardDesign) => changeTier({ cardDesign })} />
      <div className="divide-y divide-[#e5ded4]">
        {benefits.map((benefit, index) => <details key={index} data-membership-benefit={index} className="group/benefit min-w-0">
          <summary aria-label={`編輯權益 ${index + 1}`} className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
            <span className="shrink-0 text-sm font-semibold">權益 {index + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-[#6b6156]">{membershipBenefitLabel(benefit.label, tier)}</span><ChevronDown size={18} className="shrink-0 group-open/benefit:rotate-180" />
          </summary>
          <div className="grid min-w-0 gap-3 pb-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm">權益文字<input aria-label={`權益 ${index + 1} 文字`} maxLength={60} value={draftTier?.benefits?.[index]?.label ?? benefit.label} onChange={(e) => changeBenefit(index, { label: e.target.value })} className={`${field} mt-1`} placeholder="消費回饋 {rate}%" /></label>
            <label className="min-w-0 text-sm">權益說明<input aria-label={`權益 ${index + 1} 說明`} maxLength={60} value={draftTier?.benefits?.[index]?.description ?? benefit.description ?? ''} onChange={(e) => changeBenefit(index, { description: e.target.value })} className={`${field} mt-1`} /></label>
            <details data-membership-icon-picker className="group/icons min-w-0 sm:col-span-2">
              <summary aria-label={`權益 ${index + 1} 圖示`} className="flex min-h-12 cursor-pointer list-none items-center gap-3 border-y border-[#eee8df] py-3 [&::-webkit-details-marker]:hidden">
                <Image src={benefit.image || `/membership/icons/${benefit.icon}.svg`} width={24} height={24} unoptimized alt="" className={`h-6 w-6 shrink-0 object-contain ${benefit.image ? '' : 'brightness-50'}`} />
                <span className="min-w-0 flex-1 text-sm">{benefit.image ? '自訂圖示' : MEMBERSHIP_ICONS.find((icon) => icon.id === benefit.icon)?.name}</span><ChevronDown size={18} className="shrink-0 group-open/icons:rotate-180" />
              </summary>
              <div role="group" aria-label={`權益 ${index + 1} 圖示選擇`} className="grid grid-cols-3 gap-2 py-3 sm:grid-cols-5">
                {MEMBERSHIP_ICONS.map((icon) => <button key={icon.id} type="button" title={icon.name} aria-label={`權益 ${index + 1} 圖示：${icon.name}`} aria-pressed={!benefit.image && benefit.icon === icon.id} onClick={() => changeBenefit(index, { icon: icon.id, image: '' })} className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md border p-2 text-xs ${!benefit.image && benefit.icon === icon.id ? 'border-[#1f1b19] bg-[#f1f4f7]' : 'border-[#dedbd5] bg-white'}`}><Image src={`/membership/icons/${icon.id}.svg`} width={24} height={24} unoptimized alt="" className="h-6 w-6 brightness-50" /><span>{icon.name}</span></button>)}
              </div>
              <div className="flex items-center gap-2 pb-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#dedbd5] px-3 py-2 text-xs"><Upload size={15} />{uploading === index ? '上傳中…' : '上傳圖示'}<input aria-label={`上傳權益 ${index + 1} 圖示`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void upload(file, index); }} /></label>
                {benefit.image ? <button type="button" aria-label={`移除權益 ${index + 1} 自訂圖示`} title="恢復 SVG 圖示" onClick={() => changeBenefit(index, { image: '' })} className="flex h-11 w-11 items-center justify-center"><X size={16} /></button> : null}
              </div>
            </details>
          </div>
        </details>)}
      </div>
      {error ? <p role="alert" className="text-sm text-[#a13c32]">{error}</p> : null}
      <MembershipCard tier={tier} next={next} spend={PREVIEW_AMOUNT} toNext={next ? Math.max(0, next.threshold - PREVIEW_AMOUNT) : 0} memberName={ownerName.trim() || '店主'} brandName="" settings={card} periodMonths={normalized.keepMonths} credit={{ balance: PREVIEW_AMOUNT, status: '訂單完成後依會員等級累積回饋金。' }} />
    </fieldset>
  </section>;
}

function DesignPicker({ selected, onSelect }: { selected: MembershipDesignId; onSelect: (id: MembershipDesignId) => void }) {
  const index = MEMBERSHIP_DESIGNS.findIndex((design) => design.id === selected);
  const [viewport, api] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps', startIndex: index, dragFree: true });
  const [nav, setNav] = useState({ previous: false, next: true });
  const id = useId();
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (!api) return;
    const update = () => setNav({ previous: api.canScrollPrev(), next: api.canScrollNext() });
    const frame = requestAnimationFrame(update);
    api.on('select', update).on('reInit', update);
    return () => { cancelAnimationFrame(frame); api.off('select', update).off('reInit', update); };
  }, [api]);
  useEffect(() => { api?.scrollTo(index, true); }, [api, index]);
  return <div className="relative min-w-0" data-membership-carousel>
    <div id={id} ref={viewport} role="group" aria-label="選擇會員卡面" tabIndex={0} className="overflow-hidden [touch-action:pan-y_pinch-zoom] focus-visible:outline-2 focus-visible:outline-offset-2" onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); api?.scrollNext(reduced()); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); api?.scrollPrev(reduced()); }
      if (event.key === 'Home') { event.preventDefault(); api?.scrollTo(0, reduced()); }
      if (event.key === 'End') { event.preventDefault(); api?.scrollTo(MEMBERSHIP_DESIGNS.length - 1, reduced()); }
    }}>
      <div className="flex select-none gap-2" data-membership-carousel-track>
        {MEMBERSHIP_DESIGNS.map((design) => <button key={design.id} data-membership-design={design.id} type="button" aria-label={`選擇${design.name}卡面`} aria-pressed={selected === design.id} onClick={() => onSelect(design.id)} className={`min-w-0 flex-[0_0_64%] overflow-hidden rounded-lg border-2 text-left sm:flex-[0_0_30%] ${selected === design.id ? 'border-[#1f1b19]' : 'border-transparent'}`}><Image src={`/membership/cards/${design.file}.thumb.webp`} width={320} height={240} unoptimized draggable={false} alt="" className="aspect-[4/3] w-full object-contain" /><span className="flex min-h-8 items-center justify-between gap-2 px-2 py-1 text-xs"><span>{design.name}</span>{selected === design.id ? <Check size={14} className="shrink-0" /> : null}</span></button>)}
      </div>
    </div>
    <button type="button" title="向左滑動會員卡" aria-label="向左滑動會員卡" aria-controls={id} disabled={!nav.previous} onClick={() => api?.scrollPrev(reduced())} className="absolute left-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#dedbd5] bg-white/95 shadow-sm disabled:invisible"><ChevronLeft size={22} /></button>
    <button type="button" title="向右滑動會員卡" aria-label="向右滑動會員卡" aria-controls={id} disabled={!nav.next} onClick={() => api?.scrollNext(reduced())} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#dedbd5] bg-white/95 shadow-sm disabled:opacity-35"><ChevronRight size={22} /></button>
  </div>;
}
