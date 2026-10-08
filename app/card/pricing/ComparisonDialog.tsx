'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Maximize2, X } from 'lucide-react';
import type { CardTier } from '@/lib/card-plan';
import TierTable from '../TierTable';
import styles from './pricing.module.css';

export default function ComparisonDialog({ promoTier }: { promoTier?: CardTier }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const slide = (direction: number) => {
    content.current?.querySelector('[role="region"]')?.scrollBy({
      left: direction * 180,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };
  return <>
    <button ref={trigger} type="button" className={styles.comparisonTrigger} aria-haspopup="dialog" onClick={() => {
      dialog.current?.showModal();
      const region = content.current?.querySelector('[role="region"]');
      region?.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      setOpen(true);
    }}>完整功能比較 <Maximize2 size={20} /></button>
    <dialog ref={dialog} className={styles.comparisonDialog} aria-labelledby={titleId}
      onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.comparisonPanel}>
        <header className={styles.comparisonHeader}>
          <h2 id={titleId}>完整功能比較</h2>
          <div>
            <button type="button" onClick={() => slide(-1)} aria-label="向左比較方案" title="向左比較方案"><ArrowLeft size={20} /></button>
            <button type="button" onClick={() => slide(1)} aria-label="向右比較方案" title="向右比較方案"><ArrowRight size={20} /></button>
            <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="關閉功能比較" title="關閉功能比較"><X size={22} /></button>
          </div>
        </header>
        <div ref={content} className={styles.comparisonBody}><TierTable tableOnly promoTier={promoTier} /></div>
      </div>
    </dialog>
  </>;
}
