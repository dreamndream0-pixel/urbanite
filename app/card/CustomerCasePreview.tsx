'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { customerCases } from './customer-cases';
import styles from './case-studies.module.css';

const cases = customerCases.filter(item => item.kind === 'live');

export default function CustomerCasePreview() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  function move(direction: number) {
    const next = Math.max(0, Math.min(cases.length - 1, active + direction));
    const element = track.current?.children[next] as HTMLElement | undefined;
    if (!element || !track.current) return;
    track.current.scrollTo({ left: element.offsetLeft - (track.current.children[0] as HTMLElement).offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function updateActive() {
    const element = track.current;
    if (!element) return;
    const start = (element.children[0] as HTMLElement).offsetLeft;
    let nearest = 0;
    let distance = Infinity;
    Array.from(element.children).forEach((child, i) => {
      const delta = Math.abs((child as HTMLElement).offsetLeft - start - element.scrollLeft);
      if (delta < distance) { distance = delta; nearest = i; }
    });
    setActive(nearest);
  }
  return <section id="customer-cases" className={styles.homeSection} aria-labelledby="case-preview-title">
    <div className={styles.sectionHeading}><div><small>SELECTED WORK</small><h2 id="case-preview-title">客戶案例</h2></div><div className={styles.caseNavigation}><Link href="/card/cases">查看全部<ArrowRight size={17} /></Link><div><button type="button" aria-label="上一個網站範例" title="上一個網站範例" disabled={active === 0} onClick={() => move(-1)}><ArrowLeft size={20} /></button><button type="button" aria-label="下一個網站範例" title="下一個網站範例" disabled={active === cases.length - 1} onClick={() => move(1)}><ArrowRight size={20} /></button></div></div></div>
    <div ref={track} className={styles.previewGrid} role="region" aria-label="網站範例" aria-roledescription="輪播" tabIndex={0}
      onKeyDown={event => { if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }}
      onScroll={updateActive}>
      {cases.map(item => <Link className={styles.previewItem} href={`/card/cases#${item.id}`} key={item.id} aria-label={`查看 ${item.name} 網站案例`}>
      <div className={styles.previewImage}><Image src={item.image} alt={`${item.name} 完整網頁截圖`} width={1440} height={1100} sizes="(max-width: 640px) 87vw, (max-width: 1200px) 90vw, 1080px" /></div>
      <div className={styles.previewCaption}><div><small>{item.categoryLabel}</small><h3>{item.name}</h3></div><ArrowRight size={19} /></div>
    </Link>)}</div>
    <p className={styles.casePosition} aria-live="polite">{active + 1} / {cases.length}</p>
  </section>;
}
