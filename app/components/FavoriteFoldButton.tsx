'use client';

import { useEffect, useId, useRef, useState } from 'react';

const HEART = 'M12 21s-7.2-4.5-9.2-9.1C1.3 8.5 3.4 5 7 5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.7 3.5 4.2 6.9C19.2 16.5 12 21 12 21z';

function sheetPath(progress: number) {
  // Both ends of the diagonal stay attached; only the two free edges curl.
  const lift = Math.sin(Math.PI * progress);
  const x = 56 - 50 * progress;
  const y = 39 * progress - 9 * lift;
  return `M0 0
    C${18.667 - 6.667 * progress} ${8 * progress}
     ${37.333 - 36.333 * progress} ${30 * progress - 6 * lift} ${x} ${y}
    C${56 - 38 * progress} ${18.667 + 18.333 * progress - 5 * lift}
     ${56 - 12 * progress} ${37.333 + 4.667 * progress} 56 56 Z`;
}

export default function FavoriteFoldButton({
  productName,
  isSaved,
  isLoading,
  pending,
  onSavedChange,
}: {
  productName: string;
  isSaved: boolean;
  isLoading: boolean;
  pending: boolean;
  onSavedChange: (next: boolean) => void;
}) {
  const id = useId().replace(/:/g, '');
  const [progress, setProgress] = useState(isSaved ? 1 : 0);
  const current = useRef(progress);
  const loaded = useRef(!isLoading);
  const disabled = isLoading || pending;

  useEffect(() => {
    const target = isSaved ? 1 : 0;
    const from = current.current;
    const initialLoad = isLoading || !loaded.current;
    loaded.current = !isLoading;
    if (from === target) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const duration = initialLoad || motion.matches ? 0 : 1000 * Math.abs(target - from);
    let frame = 0;
    let start: number | undefined;

    function finish() {
      window.cancelAnimationFrame(frame);
      current.current = target;
      setProgress(target);
    }

    function advance(now: number) {
      start ??= now;
      const elapsed = duration ? Math.min((now - start) / duration, 1) : 1;
      // One reversible timeline drives the paper, its mask, light and shadow.
      const eased = (1 - Math.cos(Math.PI * elapsed)) / 2;
      current.current = from + (target - from) * eased;
      setProgress(current.current);
      if (elapsed < 1) frame = window.requestAnimationFrame(advance);
    }

    function onMotionChange() {
      if (motion.matches) finish();
    }

    frame = window.requestAnimationFrame(advance);
    motion.addEventListener('change', onMotionChange);
    return () => {
      window.cancelAnimationFrame(frame);
      motion.removeEventListener('change', onMotionChange);
    };
  }, [isSaved, isLoading]);

  const paper = sheetPath(progress);
  const turning = progress > 0 && progress < 1;

  return (
    <button
      type="button"
      aria-label={`${isSaved ? '取消收藏' : '收藏'}：${productName}`}
      aria-pressed={isSaved}
      aria-disabled={disabled}
      aria-busy={pending}
      title={isSaved ? '取消收藏' : '加入收藏'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onSavedChange(!isSaved);
      }}
      className="favorite-fold absolute right-0 top-0 z-10"
      data-turning={turning || undefined}
    >
      <svg className="favorite-fold__stage" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`${id}-corner`}>
            <path d="M0 0H44Q56 0 56 12V56H0Z" />
          </clipPath>
          <clipPath id={`${id}-sheet`}>
            <path d={paper} />
          </clipPath>
          <mask id={`${id}-reveal`} maskUnits="userSpaceOnUse" x="0" y="0" width="56" height="56" style={{ maskType: 'luminance' }}>
            <path d="M0 0H56V56Z" fill="white" />
            <path d={paper} fill="black" stroke="black" strokeWidth=".6" />
          </mask>
          <linearGradient id={`${id}-paper`} gradientUnits="userSpaceOnUse" x1="9" y1="43" x2="34" y2="20">
            <stop offset="0" stopColor="white" />
            <stop offset=".25" stopColor="var(--fold-paper)" />
            <stop offset=".56" stopColor="var(--fold-paper-back)" />
            <stop offset=".82" stopColor="var(--fold-paper)" />
            <stop offset="1" stopColor="white" />
          </linearGradient>
          <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <g clipPath={`url(#${id}-corner)`}>
          <g mask={`url(#${id}-reveal)`} opacity={Math.min(progress * 40, 1)}>
            <path d="M0 0H56V56Z" fill="var(--fold-active)" />
            <path d={HEART} transform="translate(32 5) scale(.75)" fill="var(--fold-light)" />
          </g>
          <path d={paper} transform={`translate(${-1.5 * progress} ${3 * progress})`} fill="var(--fold-shadow)" filter={`url(#${id}-shadow)`} opacity={progress} />
          <path d={paper} fill="white" />
          <path d={paper} fill={`url(#${id}-paper)`} opacity={progress} />
          <g clipPath={`url(#${id}-sheet)`} opacity={1 - progress}>
            <path d={HEART} transform="translate(32 5) scale(.75)" fill="none" stroke="var(--fold-ink)" strokeWidth="2" strokeLinejoin="round" />
          </g>
        </g>
      </svg>
    </button>
  );
}
