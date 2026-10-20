'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LoyaltyTier } from '@/lib/loyalty-settings';
import { membershipBenefitLabel, membershipDesign, membershipProgress, resolveMembershipBenefits, resolveMembershipCard, type MembershipCardSettings } from '@/lib/membership-card';
import styles from './MembershipCard.module.css';

type Props = {
  tier: LoyaltyTier; next: LoyaltyTier | null; spend: number; toNext: number;
  memberName: string; brandName: string; settings?: MembershipCardSettings;
  onAction?: () => void; expanded?: boolean; detailsId?: string;
  animate?: boolean; revealKey?: number;
};
const money = (value: number) => `NT$${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;

export default function MembershipCard({ tier, next, spend, toNext, memberName, brandName, settings, onAction, expanded, detailsId, animate = false, revealKey = 0 }: Props) {
  const design = membershipDesign(tier.cardDesign);
  const card = resolveMembershipCard(settings);
  const benefits = resolveMembershipBenefits(tier.benefits);
  const progress = membershipProgress(spend, next?.threshold ?? null);
  const title = useRef<HTMLHeadingElement>(null);
  const amount = useRef<HTMLElement>(null);
  const [loadedDesign, setLoadedDesign] = useState('');
  const [textureSource, setTextureSource] = useState('');
  // Fit unusually long tier names inside the original artwork's title region.
  useEffect(() => {
    const nodes = [title.current, amount.current].filter((node): node is HTMLElement => node !== null);
    const fit = () => {
      for (const node of nodes) {
        node.style.fontSize = '';
        let size = parseFloat(getComputedStyle(node).fontSize);
        while ((node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) && size > 9) node.style.fontSize = `${--size}px`;
      }
    };
    const observer = new ResizeObserver(fit); nodes.forEach((node) => observer.observe(node));
    fit(); void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [tier.name, spend]);
  const vars = { '--mc-ink': design.ink, '--mc-surface': design.surface, '--mc-accent': design.accent } as CSSProperties;
  const action = <>{card.actionLabel}</>;
  return <section className={styles.root} style={vars} data-membership-card={design.id} aria-label={`${memberName}的${tier.name}`}>
    <div className={styles.art}>
      <Image className={styles.background} src={`/membership/cards/${design.file}.webp`} width={1448} height={1086} sizes="(max-width: 700px) 100vw, 700px" loading={onAction ? 'eager' : 'lazy'} onLoad={(event) => { setLoadedDesign(design.id); setTextureSource(event.currentTarget.currentSrc); }} alt="" />
      {loadedDesign === design.id && textureSource ? <>
        <span className={`${styles.decorationMask} ${styles.headingMask}`} style={{ backgroundImage: `url("${textureSource}")` }} aria-hidden="true" />
        <span className={`${styles.decorationMask} ${styles.sloganMask}`} style={{ backgroundImage: `url("${textureSource}")` }} aria-hidden="true" />
      </> : null}
      {animate && loadedDesign === design.id ? <span key={revealKey} className={styles.shine} data-card-shine="true" aria-hidden="true" /> : null}
      <p className={styles.brand} title={brandName ? `${brandName} · ${card.title}` : card.title}>{card.title}</p>
      <h3 ref={title} className={styles.tier}>{tier.name}</h3>
      <p className={styles.name} title={memberName}>{memberName}</p>
      {benefits.map((benefit, index) => <div key={index}>
        <span className={`${styles.iconMask} ${design.light ? styles.lightIcon : ''}`} style={{ left: `${[36.1, 56.9, 77.5][index]}%` }}>
          <Image src={benefit.image || `/membership/icons/${benefit.icon}.svg`} width={48} height={48} unoptimized alt="" className={benefit.image ? styles.customIcon : styles.svgIcon} />
        </span>
        <span aria-hidden="true" className={styles.benefitLabel} style={{ left: `${[40.1, 60.9, 81.5][index]}%` }} title={membershipBenefitLabel(benefit.label, tier)}>{membershipBenefitLabel(benefit.label, tier)}</span>
      </div>)}
      <div className={styles.finances}>
        <div className={styles.spend}><span>有效消費</span><strong ref={amount}>{money(spend)}</strong></div>
        <div className={styles.upgrade}>
          <p title={next ? `下一級：${next.name}` : '已達最高等級'}>{next ? `下一級：${next.name}` : '已達最高等級'}</p>
          <div className={styles.track} role="progressbar" aria-label="會員升級進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={next ? `再消費 ${money(toNext)} 升級${next.name}` : '已達最高等級'}><span style={{ width: `${progress}%` }} /></div>
          <small>{next ? `尚差 ${money(toNext)}` : '尊享最高等級權益'}</small>
        </div>
      </div>
      <p className={styles.subtitle} title={card.subtitle}>{card.subtitle}</p>
      {onAction ? <button type="button" className={styles.action} onClick={onAction} aria-expanded={expanded} aria-controls={detailsId}>{action}</button> : <span className={styles.action}>{action}</span>}
    </div>
    <div className={styles.details}>
      {card.title ? <p className={styles.caption}>{card.title}</p> : null}
      <ul>{benefits.filter((benefit) => benefit.label).map((benefit, index) => <li key={index}><Image src={benefit.image || `/membership/icons/${benefit.icon}.svg`} alt="" width={18} height={18} unoptimized className={benefit.image ? styles.customIcon : styles.svgIcon} /><span>{membershipBenefitLabel(benefit.label, tier)}</span></li>)}</ul>
    </div>
  </section>;
}
