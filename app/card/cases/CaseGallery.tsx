'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { CONTACT_LINE_URL } from '@/lib/card-plan';
import { useScrollLock } from '@/app/components/useScrollLock';
import { caseCategories, customerCases, type CaseCategory, type CustomerCase } from '../customer-cases';
import styles from '../case-studies.module.css';

const status = (item: CustomerCase) => item.kind === 'live' ? '實際網站' : item.kind === 'demo' ? '示意設計' : '後台截圖待補';

export default function CaseGallery() {
  const [category, setCategory] = useState<'all' | CaseCategory>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const filtered = customerCases.filter(item => category === 'all' || item.category === category);
  const selected = customerCases.find(item => item.id === selectedId);
  const index = filtered.findIndex(item => item.id === selectedId);
  useScrollLock(Boolean(selected));

  useEffect(() => {
    let frame = 0;
    function showLinkedCase() {
      const id = window.location.hash.slice(1);
      if (!customerCases.some(item => item.id === id)) return;
      cancelAnimationFrame(frame);
      setCategory('all');
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
      });
    }
    if (window.location.hash) frame = requestAnimationFrame(showLinkedCase);
    window.addEventListener('hashchange', showLinkedCase);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', showLinkedCase); };
  }, []);

  function openPreview(item: CustomerCase, button: HTMLButtonElement) {
    returnFocus.current = button;
    setSelectedId(item.id);
    dialog.current?.showModal();
  }

  function move(direction: number) {
    const next = (index + direction + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  }

  return <>
    <section className={styles.gallerySection} aria-labelledby="cases-title">
      <div className={styles.galleryHeading}><div><Link className={styles.back} href="/card"><ArrowLeft size={15} />URBANLINKS</Link><h1 id="cases-title">客戶案例</h1><p>從品牌商店到日常服務，每一種經營都有自己的樣子。</p></div><span className={styles.galleryCount}>WORK / {String(customerCases.length).padStart(2, '0')}</span></div>
      <div className={styles.filters} aria-label="案例分類">{caseCategories.map(item => <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => { setCategory(item.key); history.replaceState(null, '', location.pathname + location.search); }}>{item.label}<small>{customerCases.filter(study => item.key === 'all' || study.category === item.key).length}</small></button>)}</div>
      <div className={styles.results}><p role="status">共 {filtered.length} 個案例與示意</p><span>實際網站與示意設計分別標示</span></div>
      <div className={styles.galleryGrid}>{filtered.map(item => <article className={styles.caseCard} id={item.id} key={item.id}>
        <button className={styles.caseImage} type="button" aria-label={`預覽 ${item.name}`} onClick={event => openPreview(item, event.currentTarget)}>
          <Image src={item.image} alt={item.kind === 'pending' ? '租屋網公開頁面，非代管後台畫面' : `${item.name} ${item.kind === 'demo' ? '示意設計' : '實際網站截圖'}`} fill sizes="(max-width: 640px) 92vw, (max-width: 1000px) 46vw, 360px" />
          <span className={styles.caseBadge} data-kind={item.kind}>{status(item)}</span><span className={styles.zoom}><ZoomIn size={18} /></span>
        </button>
        <div className={styles.caseInfo}><small>{item.categoryLabel}</small><h2>{item.name}</h2><p>{item.description}</p><div className={styles.tags}>{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          {item.url ? <a className={styles.caseAction} href={item.url} target="_blank" rel="noopener noreferrer">開啟網站<ArrowUpRight size={16} /></a> : <button className={styles.caseAction} type="button" onClick={event => openPreview(item, event.currentTarget)}>{item.kind === 'pending' ? '查看展示位置' : '查看示意'}<ArrowRight size={16} /></button>}
        </div>
      </article>)}</div>
      <div className={styles.galleryContact}><h2>下一個案例，會是你的品牌。</h2><a href={CONTACT_LINE_URL} target="_blank" rel="noopener noreferrer">聯繫專員<ArrowUpRight size={17} /></a></div>
    </section>
    <dialog ref={dialog} className={styles.previewDialog} aria-labelledby="case-dialog-title"
      onClose={() => { setSelectedId(null); const target = returnFocus.current; requestAnimationFrame(() => target?.focus({ preventScroll: true })); }}
      onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); move(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {selected && <div className={styles.dialogLayout}>
        <header className={styles.previewHeader}><div><small>{status(selected)}</small><h2 id="case-dialog-title">{selected.name}</h2></div><div className={styles.dialogControls}><span>{index + 1} / {filtered.length}</span><button type="button" onClick={() => move(-1)} aria-label="上一個案例"><ChevronLeft /></button><button type="button" onClick={() => move(1)} aria-label="下一個案例"><ChevronRight /></button><button autoFocus type="button" onClick={() => dialog.current?.close()} aria-label="關閉案例預覽"><X /></button></div></header>
        <div className={styles.dialogImage}><Image key={selected.id} src={selected.image} alt={`${selected.name} ${status(selected)}`} fill sizes="92vw" /></div>
        <footer className={styles.previewFooter}><div><p>{selected.description}</p>{selected.kind === 'demo' && <small>品牌及畫面為示意設計，非真實客戶案例。</small>}</div>{selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer">前往網站<ArrowUpRight size={17} /></a>}</footer>
      </div>}
    </dialog>
  </>;
}
