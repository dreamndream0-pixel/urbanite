'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LoyaltyTier } from '@/lib/loyalty-settings';
import { MEMBERSHIP_BADGES, MEMBERSHIP_BENEFIT_CIRCLES, MEMBERSHIP_BENEFIT_DIVIDERS, membershipBenefitLabel, membershipDesign, membershipProgress, resolveMembershipBenefits, resolveMembershipCard, type MembershipCardSettings } from '@/lib/membership-card';
import styles from './MembershipCard.module.css';

type Props = {
  tier: LoyaltyTier; next: LoyaltyTier | null; spend: number; toNext: number;
  memberName: string; brandName: string; settings?: MembershipCardSettings; periodMonths?: number;
  onAction?: () => void; expanded?: boolean; detailsId?: string;
  animate?: boolean; revealKey?: number;
  credit?: { balance: number; status: string }; immersive?: boolean;
};
const money = (value: number) => `NT$${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
const texturePatch = (source: string, left: number, top: number, width: number, height: number, sampleY: number, sampleX = left): CSSProperties => ({
  backgroundImage: `url("${source}")`, left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
  backgroundSize: `${10000 / width}% ${10000 / height}%`, backgroundPosition: `${sampleX / (100 - width) * 100}% ${sampleY / (100 - height) * 100}%`,
});

export default function MembershipCard({ tier, next, spend, toNext, memberName, brandName, settings, periodMonths = 12, onAction, expanded, detailsId, animate = false, revealKey = 0, credit, immersive = false }: Props) {
  const design = membershipDesign(tier.cardDesign);
  const card = resolveMembershipCard(settings);
  const benefits = resolveMembershipBenefits(tier.benefits);
  const target = next?.threshold ?? tier.threshold;
  const balance = credit?.balance ?? 0;
  const creditStatus = credit?.status ?? '訂單完成後依會員等級累積回饋金。';
  const emptyRules = design.id === 'emerald' ? [27.1, 35.9] : design.id === 'royal-blue' ? [32, 37.3] : design.id === 'diamond' ? [33.7] : [];
  const perkRule = design.id === 'emerald' ? 47.8 : design.id === 'royal-blue' ? 46.2 : null;
  const progress = membershipProgress(spend, next?.threshold ?? null);
  const title = useRef<HTMLHeadingElement>(null);
  const amount = useRef<HTMLElement>(null);
  const [loadedDesign, setLoadedDesign] = useState('');
  const [textureSource, setTextureSource] = useState('');
  // Fit member names and amounts without moving the artwork's text regions.
  useEffect(() => {
    const nodes = [title.current, amount.current].filter((node): node is HTMLElement => node !== null);
    let active = true;
    const fit = () => {
      if (!active) return;
      for (const node of nodes) {
        node.style.fontSize = '';
        let size = parseFloat(getComputedStyle(node).fontSize);
        while ((node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) && size > 6.3) {
          size = Math.max(6.3, size - 0.7);
          node.style.fontSize = `${size}px`;
        }
      }
    };
    const observer = new ResizeObserver(fit); nodes.forEach((node) => observer.observe(node));
    fit(); void document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [memberName, balance]);
  const vars = { '--mc-ink': design.ink, '--mc-surface': design.surface, '--mc-accent': design.accent } as CSSProperties;
  const action = <><span>{card.actionLabel}</span><ArrowRight aria-hidden="true" /></>;
  return <section className={`${styles.root} ${immersive ? styles.immersive : ''}`} style={vars} data-membership-card={design.id} aria-label={`${memberName}的${tier.name}`}>
    <div className={styles.art} data-card-art-ready={loadedDesign === design.id}>
      <Image className={styles.background} src={`/membership/cards/${design.file}.webp`} width={1448} height={1086} sizes="(max-width: 700px) 100vw, 700px" loading={onAction ? 'eager' : 'lazy'} onLoad={(event) => { setLoadedDesign(design.id); setTextureSource(event.currentTarget.currentSrc); }} alt="" />
      {loadedDesign === design.id && textureSource ? <>
        <span className={`${styles.decorationMask} ${styles.headingMask}`} style={{ backgroundImage: `url("${textureSource}")` }} aria-hidden="true" />
        <span className={`${styles.decorationMask} ${styles.sloganMask}`} style={{ backgroundImage: `url("${textureSource}")` }} aria-hidden="true" />
        {emptyRules.map((y) => <span key={y} className={styles.decorationMask} style={texturePatch(textureSource, 33.3, y - 1.2, design.id === 'diamond' ? 35 : 29, 2.4, y + 1.8)} aria-hidden="true" />)}
        {perkRule !== null ? [40, 60.8, 81.4].map((x) => <span key={x} className={styles.decorationMask} style={texturePatch(textureSource, x, perkRule - 1.2, 12, 2.4, perkRule + 2)} aria-hidden="true" />) : null}
        {MEMBERSHIP_BENEFIT_DIVIDERS[design.id].map(([x, top, bottom]) => <span key={x} data-card-divider-mask className={`${styles.decorationMask} ${styles.dividerMask}`} style={texturePatch(textureSource, (x - 8) / 1448 * 100, (top - 8) / 1086 * 100, 16 / 1448 * 100, (bottom - top + 17) / 1086 * 100, (top - 8) / 1086 * 100, (x - 32) / 1448 * 100)} aria-hidden="true" />)}
      </> : null}
      {animate && loadedDesign === design.id ? <span key={revealKey} className={styles.shine} data-card-shine="true" aria-hidden="true" /> : null}
      <span className={styles.badge} data-card-badge>{MEMBERSHIP_BADGES[design.id]}</span>
      <p className={styles.brand} title={brandName ? `${brandName} · ${card.title}` : card.title}>{card.title}</p>
      <h3 ref={title} className={styles.memberName} title={memberName}>{memberName}</h3>
      <p className={styles.intro} title={card.intro}>{card.intro}</p>
      {benefits.map((benefit, index) => {
        const [x, y, radius] = MEMBERSHIP_BENEFIT_CIRCLES[design.id][index];
        const diameter = (radius - 3) * 2;
        return <div key={index} className={styles.benefit} data-card-benefit style={{
          left: `${(x - diameter / 2) / 1448 * 100}%`, top: `${y / 1086 * 100 - 4}%`,
          '--mc-icon-size': `${diameter / (1448 * .205) * 100}%`,
        } as CSSProperties}>
          <span className={`${styles.iconMask} ${design.light ? styles.lightIcon : ''}`} data-card-icon>
            <Image src={benefit.image || `/membership/icons/${benefit.icon}.svg`} width={48} height={48} unoptimized alt="" className={benefit.image ? styles.customIcon : styles.svgIcon} />
          </span>
          <span className={styles.benefitCopy} title={[membershipBenefitLabel(benefit.label, tier), benefit.description].filter(Boolean).join(' · ')}>
            <strong>{membershipBenefitLabel(benefit.label, tier)}</strong>
            {benefit.description ? <small>{membershipBenefitLabel(benefit.description, tier)}</small> : null}
          </span>
        </div>;
      })}
      <div className={styles.finances}>
        <div className={styles.spend} data-card-credit>
          <span className={styles.creditLabel}>回饋金 <small title={`${tier.name}・回饋 ${tier.rate}%`}>{tier.name}・回饋 {tier.rate}%</small></span>
          <div className={styles.amount}><strong ref={amount} data-card-amount>{money(balance)}</strong></div>
          <small className={styles.creditStatus} title={creditStatus}>{creditStatus}</small>
        </div>
        <div className={styles.upgrade}>
          <div className={styles.upgradeHeading}><p>{next ? '升等進度' : '已達最高等級'}</p><span>{progress}%</span></div>
          <div className={styles.track} role="progressbar" aria-label="會員升級進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={next ? `再消費 ${money(toNext)} 升級${next.name}` : '已達最高等級'}><span style={{ width: `${progress}%` }} /></div>
          <small data-card-spend>{next ? `近 ${periodMonths} 個月 ${money(spend)} / ${target.toLocaleString('en-US')}` : `近 ${periodMonths} 個月 ${money(spend)}`}</small>
        </div>
      </div>
      <div className={styles.footer} data-card-footer><span className={styles.footerEmblem} aria-hidden="true" /><p className={styles.subtitle} title={card.subtitle}>{card.subtitle}</p></div>
      {onAction ? <button type="button" className={styles.action} onClick={onAction} aria-expanded={expanded} aria-controls={detailsId}>{action}</button> : <span className={styles.action}>{action}</span>}
    </div>
  </section>;
}
