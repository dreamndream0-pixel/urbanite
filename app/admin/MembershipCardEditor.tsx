'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Sparkles, Upload, X } from 'lucide-react';
import MembershipCard from '@/app/components/MembershipCard';
import { nextTier, resolveLoyalty, type LoyaltySettings, type LoyaltyTier } from '@/lib/loyalty-settings';
import { MEMBERSHIP_DESIGNS, MEMBERSHIP_ICONS, membershipDesign, resolveMembershipBenefits, resolveMembershipCard, type MembershipBenefit } from '@/lib/membership-card';

const field = 'w-full min-w-0 rounded-lg border border-[#dedbd5] bg-white px-3 py-2 text-base sm:text-sm';
type Props = { tierKey: string; settings: LoyaltySettings; onChange: (update: (settings: LoyaltySettings) => LoyaltySettings) => void; onBusyChange: (busy: boolean) => void };

export default function MembershipCardEditor({ tierKey, settings, onChange, onBusyChange }: Props) {
  const [previewName, setPreviewName] = useState('會員姓名');
  const [spend, setSpend] = useState(1500);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [reveal, setReveal] = useState(0);
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
        {([['title', '權益區標題', 24], ['subtitle', '卡片標語', 40], ['actionLabel', '按鈕文字', 12]] as const).map(([key, label, max]) => <label key={key} className="min-w-0 text-sm">{label}<input aria-label={label} maxLength={max} value={settings.card?.[key] ?? card[key]} onChange={(e) => onChange((s) => ({ ...s, card: { ...resolveMembershipCard(s.card), [key]: e.target.value } }))} className={`${field} mt-1`} /></label>)}
      </div>
      <div role="group" aria-label="選擇會員卡面" className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
        {MEMBERSHIP_DESIGNS.map((design) => <button key={design.id} type="button" aria-label={`選擇${design.name}卡面`} aria-pressed={membershipDesign(tier.cardDesign).id === design.id} onClick={() => changeTier({ cardDesign: design.id })} className={`min-w-0 overflow-hidden rounded-lg border-2 text-left ${membershipDesign(tier.cardDesign).id === design.id ? 'border-[#1f1b19]' : 'border-transparent'}`}><Image src={`/membership/cards/${design.file}.thumb.webp`} width={320} height={240} unoptimized alt="" className="aspect-[4/3] w-full object-contain" /><span className="block px-2 py-1 text-xs">{design.name}</span></button>)}
      </div>
      <div className="divide-y divide-[#e5ded4]">
        {benefits.map((benefit, index) => <div key={index} className="grid min-w-0 items-end gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
          <label className="min-w-0 text-sm">權益 {index + 1}<input aria-label={`權益 ${index + 1} 文字`} maxLength={60} value={draftTier?.benefits?.[index]?.label ?? benefit.label} onChange={(e) => changeBenefit(index, { label: e.target.value })} className={`${field} mt-1`} placeholder="消費回饋 {rate}%" /></label>
          <label className="min-w-0 text-sm">SVG 圖示<select aria-label={`權益 ${index + 1} SVG 圖示`} value={benefit.icon} onChange={(e) => changeBenefit(index, { icon: e.target.value as MembershipBenefit['icon'], image: '' })} className={`${field} mt-1`}>{MEMBERSHIP_ICONS.map((icon) => <option key={icon.id} value={icon.id}>{icon.name}</option>)}</select></label>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#dedbd5] px-3 py-2 text-xs"><Upload size={15} />{uploading === index ? '上傳中…' : '上傳圖示'}<input aria-label={`上傳權益 ${index + 1} 圖示`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void upload(file, index); }} /></label>
            {benefit.image ? <button type="button" aria-label={`移除權益 ${index + 1} 自訂圖示`} title="恢復 SVG 圖示" onClick={() => changeBenefit(index, { image: '' })} className="p-2"><X size={16} /></button> : null}
          </div>
        </div>)}
      </div>
      {error ? <p role="alert" className="text-sm text-[#a13c32]">{error}</p> : null}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="text-sm">預覽會員姓名<input aria-label="預覽會員姓名" maxLength={80} value={previewName} onChange={(e) => setPreviewName(e.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-sm">預覽消費金額<input aria-label="預覽消費金額" type="number" min={0} max={100000000} value={spend} onChange={(e) => setSpend(Math.max(0, Number(e.target.value) || 0))} className={`${field} mt-1`} /></label>
      </div>
      <div className="flex justify-end"><button type="button" title="預覽開啟會員卡的金光效果" aria-label="預覽會員卡金光" onClick={() => setReveal((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-[#dedbd5] px-3 py-2 text-sm"><Sparkles size={16} />預覽金光</button></div>
      <MembershipCard tier={tier} next={next} spend={spend} toNext={next ? Math.max(0, next.threshold - spend) : 0} memberName={previewName || '會員'} brandName="" settings={card} animate={reveal > 0} revealKey={reveal} />
    </fieldset>
  </section>;
}
