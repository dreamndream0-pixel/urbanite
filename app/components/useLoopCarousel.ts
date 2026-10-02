'use client';

import { useEffect, useRef, useState } from 'react';

const SLIDE_MS = 500;

// 無限循環左右滑動(首頁/活動頁輪播圖、商品頁照片共用)
// 軌道為 [最後一張副本, ...全部, 第一張副本],pos 為軌道上的位置(真實第 1 張 = 1)。
// 滑過最後一張會繼續滑到「第一張副本」,動畫結束後無動畫地換回真實第一張,看起來像一直往同方向滑。
export function useLoopCarousel<T>(items: T[], { autoplayMs = 0 }: { autoplayMs?: number } = {}) {
  const count = items.length;
  const looping = count > 1;
  const slides = looping ? [items[count - 1], ...items, items[0]] : items;
  const [rawPos, setPos] = useState(looping ? 1 : 0);
  // 張數變少時不會停在不存在的位置
  const pos = looping ? Math.min(rawPos, count + 1) : 0;
  const [instant, setInstant] = useState(false); // 換回真實張時暫停過場動畫
  const [dragX, setDragX] = useState(0); // 手指拖動中的即時位移(px)
  const [dragging, setDragging] = useState(false);
  const [widthPx, setWidthPx] = useState(0);
  const dragXRef = useRef(0);
  const startX = useRef<number | null>(null);
  const width = useRef(0);

  const realIndex = looping ? (pos - 1 + count) % count : 0;
  const onClone = looping && (pos === 0 || pos === count + 1);

  // 落在副本上時,瞬間換回對應的真實張
  function settle() {
    setInstant(true);
    setPos((p) => (p === 0 ? count : p === count + 1 ? 1 : p));
  }

  useEffect(() => {
    if (!onClone || dragging) return;
    const timer = window.setTimeout(settle, SLIDE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClone, dragging]);

  // 換回真實張並畫面更新後,再恢復過場動畫
  useEffect(() => {
    if (!instant) return;
    const timer = window.setTimeout(() => setInstant(false), 50);
    return () => window.clearTimeout(timer);
  }, [instant]);

  useEffect(() => {
    if (!looping || dragging || !autoplayMs) return;
    const timer = setInterval(() => setPos((p) => Math.min(p + 1, count + 1)), autoplayMs);
    return () => clearInterval(timer);
  }, [looping, count, dragging, autoplayMs]);

  const step = (delta: number) => setPos((p) => Math.max(0, Math.min(count + 1, p + delta)));
  const go = (i: number) => setPos(looping ? i + 1 : 0);

  function onDown(clientX: number, el: HTMLElement) {
    if (onClone) settle();
    startX.current = clientX;
    width.current = el.offsetWidth || 1;
    setWidthPx(width.current);
    setDragging(true);
    dragXRef.current = 0;
    setDragX(0);
  }
  function onMove(clientX: number) {
    if (startX.current === null) return;
    dragXRef.current = clientX - startX.current;
    setDragX(dragXRef.current);
  }
  function onUp() {
    if (startX.current === null) return;
    const d = dragXRef.current;
    const threshold = width.current * 0.15;
    if (looping && d <= -threshold) step(1);
    else if (looping && d >= threshold) step(-1);
    startX.current = null;
    dragXRef.current = 0;
    setDragging(false);
    setDragX(0);
  }

  const dragPercent = widthPx ? (dragX / widthPx) * 100 : 0;

  // 套在 flex 軌道上的屬性(觸控與滑鼠拖曳)
  const trackProps = {
    className: `flex ${dragging || instant ? '' : 'transition-transform duration-500 ease-out'}`,
    style: { transform: `translateX(calc(-${pos * 100}% + ${dragPercent}%))` },
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => onDown(e.touches[0].clientX, e.currentTarget),
    onTouchMove: (e: React.TouchEvent<HTMLElement>) => onMove(e.touches[0].clientX),
    onTouchEnd: onUp,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') onDown(e.clientX, e.currentTarget);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && startX.current !== null) onMove(e.clientX);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') onUp();
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') onUp();
    },
  };

  // 軌道第 i 張對應的真實序號(副本與真實張相同,換回時樣式不閃動)
  const realOf = (i: number) => (looping ? (i - 1 + count) % count : i);

  return { slides, pos, realIndex, realOf, looping, dragging, step, go, trackProps };
}
