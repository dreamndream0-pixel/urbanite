'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Minus } from 'lucide-react';
import { CONTACT_LINE_URL, TIERS, TIER_FEATURES, tierRank, type CardPeriod } from '@/lib/card-plan';
import type { CardPromo } from '@/lib/card-promo';
import { promoActive } from '@/lib/card-promo-state';
import ComparisonDialog from './ComparisonDialog';
import styles from './pricing.module.css';

const audiences = ['適合想先體驗的人', '適合個人品牌與創作者', '適合品牌、店家與自媒體', '適合企業、工作室與多元經營者'];
const captions = ['輕鬆開始', '進階實用', '品牌進階', '全方位品牌'];
const features = TIER_FEATURES.flatMap(group => group.rows).filter(row => [
  '專屬網址 /@代稱', '連結與區塊', '樣板', '數據分析', '隱藏頁尾 URBANLINKS 標誌',
  '子網域官網(你的名字.urbanite.com.tw)', '商品上架', '自訂網域',
].includes(row.label));

export default function PricingPlans({ promo, initialNow, loggedIn }: {
  promo: CardPromo; initialNow: number; loggedIn: boolean;
}) {
  const [period, setPeriod] = useState<CardPeriod>('month');
  const [now, setNow] = useState(initialNow);
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const slide = (direction: number) => {
    const element = track.current;
    if (!element) return;
    element.scrollBy({ left: direction * ((element.firstElementChild?.getBoundingClientRect().width ?? 280) + 14), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    // Refresh server-owned campaign settings without losing the selected period.
    const refresh = () => { if (!document.hidden) router.refresh(); };
    const poll = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(clock); clearInterval(poll); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [router]);
  const active = promoActive(promo, now);
  const startHref = loggedIn ? '/mycard' : '/card/register';

  return (
    <section id="plans" className={styles.plans}>
      <div className={styles.toolbar}>
        <h2>為你的下一步，選一個起點。</h2>
        <div className={styles.periods} role="group" aria-label="付款週期">
          <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>月付</button>
          <button type="button" aria-pressed={period === 'year'} onClick={() => setPeriod('year')}>年付</button>
        </div>
      </div>
      <div className={styles.planNav}>
        <Link href="#account">我的方案與付款紀錄</Link>
        <div><button type="button" onClick={() => slide(-1)} aria-label="上一個方案" title="上一個方案"><ArrowLeft size={18} /></button><button type="button" onClick={() => slide(1)} aria-label="下一個方案" title="下一個方案"><ArrowRight size={18} /></button></div>
      </div>
      <div ref={track} className={styles.grid} role="region" aria-label="方案價格" tabIndex={0}>
        {TIERS.map((tier, index) => {
          const free = tier.key === 'free';
          const covered = !free && active && tierRank(tier.key) <= tierRank(promo.tier);
          const price = tier.prices?.[period] ?? 0;
          const upgrade = `/mycard/upgrade?tier=${tier.key}&period=${period}`;
          const href = !tier.available ? CONTACT_LINE_URL : free || covered ? startHref : loggedIn ? upgrade : `/card/register?next=${encodeURIComponent(upgrade)}`;
          return <article key={tier.key} className={`${styles.plan} ${tier.key === 'max' ? styles.max : ''} ${tier.key === 'pro' ? styles.pro : ''}`}>
            <header><h3>{tier.name}</h3>{covered && <span className={styles.badge}>限時免費</span>}</header>
            <p className={styles.caption}>{captions[index]}</p>
            <div className={styles.price} aria-live="polite"><span>NT$</span><strong>{covered ? '0' : price.toLocaleString()}</strong><span>/{period === 'month' ? '月' : '年'}</span></div>
            <p className={styles.priceNote}>{covered ? <><s>NT${price.toLocaleString()} / {period === 'month' ? '月' : '年'}</s>　活動期間免費</> : period === 'year' && tier.prices ? `年繳省 NT$${(tier.prices.month * 12 - price).toLocaleString()}` : free ? '不需信用卡' : '預付制，不自動扣款'}</p>
            <p className={styles.audience}>{audiences[index]}</p>
            <Link className={styles.action} href={href} target={!tier.available ? '_blank' : undefined} rel={!tier.available ? 'noopener noreferrer' : undefined}>
              {!tier.available ? '聯絡專員建立官網' : free || covered ? '免費使用' : '立即升級'}<ArrowRight size={16} />
            </Link>
            <ul>{features.map(row => <li key={row.label} className={row.values[index] === '—' ? styles.unavailable : ''}>
              {row.values[index] === '—' ? <Minus size={16} /> : <Check size={16} />}
              <span>{row.label}{!['✓', '—'].includes(row.values[index]) && <small>{row.values[index]}</small>}</span>
            </li>)}</ul>
          </article>;
        })}
      </div>
      <ComparisonDialog promoTier={active ? promo.tier : undefined} />
      <footer className={styles.footer}>
        <Link href={startHref}>立即建立你的 URBANLINKS <ArrowRight size={22} /></Link>
        <p>MORE THAN A LINK</p>
      </footer>
    </section>
  );
}
