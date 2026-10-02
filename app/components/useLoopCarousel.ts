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

  const pointerId = useRef<number | null>(null);
  const moved = useRef(false); // 有拖曳過:放開時不要觸發點擊(例如輪播圖連結)
  const lastWheel = useRef(0);

  // 手指、滑鼠、觸控筆共用 Pointer Events;軌道設 touch-action: pan-y,
  // 讓瀏覽器只接管上下捲動,左右滑動交給輪播
  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (!looping || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (onClone) settle();
    pointerId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // 手指滑出軌道外也持續追蹤
    } catch {
      /* 無法捕捉時仍可滑動 */
    }
    startX.current = e.clientX;
    width.current = e.currentTarget.offsetWidth || 1;
    moved.current = false;
    setWidthPx(width.current);
    setDragging(true);
    dragXRef.current = 0;
    setDragX(0);
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (startX.current === null || e.pointerId !== pointerId.current) return;
    dragXRef.current = e.clientX - startX.current;
    if (Math.abs(dragXRef.current) > 6) moved.current = true;
    setDragX(dragXRef.current);
  }
  function finish(e: React.PointerEvent<HTMLElement>, cancelled: boolean) {
    if (startX.current === null || e.pointerId !== pointerId.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 已釋放 */
    }
    const d = cancelled ? 0 : dragXRef.current;
    const threshold = Math.min(width.current * 0.12, 60);
    if (d <= -threshold) step(1);
    else if (d >= threshold) step(-1);
    startX.current = null;
    pointerId.current = null;
    dragXRef.current = 0;
    setDragging(false);
    setDragX(0);
  }
  // 觸控板左右兩指滑動
  function onWheel(e: React.WheelEvent<HTMLElement>) {
    if (!looping || Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 20) return;
    const now = Date.now();
    if (now - lastWheel.current < SLIDE_MS + 150) return;
    lastWheel.current = now;
    step(e.deltaX > 0 ? 1 : -1);
  }

  const dragPercent = widthPx ? (dragX / widthPx) * 100 : 0;

  // 套在 flex 軌道上的屬性
  const trackProps = {
    className: `flex touch-pan-y ${dragging || instant ? '' : 'transition-transform duration-500 ease-out'}`,
    style: { transform: `translateX(calc(-${pos * 100}% + ${dragPercent}%))` },
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => finish(e, false),
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => finish(e, true),
    onWheel,
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (moved.current) {
        e.preventDefault();
        e.stopPropagation();
        moved.current = false;
      }
    },
    onDragStart: (e: React.DragEvent<HTMLElement>) => e.preventDefault(),
  };

  // 軌道第 i 張對應的真實序號(副本與真實張相同,換回時樣式不閃動)
  const realOf = (i: number) => (looping ? (i - 1 + count) % count : i);

  return { slides, pos, realIndex, realOf, looping, dragging, step, go, trackProps };
}
