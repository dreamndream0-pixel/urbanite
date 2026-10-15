'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// 可拖曳排序的選項標籤(會換行的多列標籤,用 2D 位置判斷落點)。
// 電腦:按住拖曳;手機:長按約 0.3 秒後拖曳(不影響一般捲動)。
export default function DraggableChips({ items, onReorder, onRemove }: { items: string[]; onReorder: (next: string[]) => void; onRemove: (item: string) => void }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const state = useRef<{ item: string; x: number; y: number; touch: boolean; timer: number; active: boolean } | null>(null);
  const latest = useRef({ items, onReorder, order });
  useEffect(() => { latest.current = { items, onReorder, order }; });

  useEffect(() => {
    const blockScroll = (e: TouchEvent) => { if (state.current?.active) e.preventDefault(); };
    const activate = () => {
      const s = state.current;
      if (!s) return;
      s.active = true;
      setDragging(s.item);
      navigator.vibrate?.(10);
    };
    const move = (e: PointerEvent) => {
      const s = state.current;
      if (!s) return;
      if (!s.active) {
        const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
        if (s.touch) { if (dist > 8) { clearTimeout(s.timer); state.current = null; } return; } // 手機:長按前移動 = 捲動
        if (dist < 5) return;
        activate();
      }
      const chips = [...(wrapRef.current?.querySelectorAll<HTMLElement>('[data-chip]') ?? [])];
      const current = latest.current.order ?? latest.current.items;
      const from = current.indexOf(s.item);
      // 找最近的標籤;在它中心左邊就插到它前面,右邊就插到它後面
      let best = -1, bestDist = Infinity, after = false;
      chips.forEach((chip, i) => {
        const r = chip.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot((e.clientX - cx) / 2, e.clientY - cy); // 同一列優先
        if (d < bestDist) { bestDist = d; best = i; after = e.clientX > cx; }
      });
      if (best < 0 || from < 0) return;
      let to = best + (after ? 1 : 0);
      if (to > from) to -= 1;
      if (to !== from) {
        const next = [...current];
        const [it] = next.splice(from, 1);
        next.splice(to, 0, it);
        latest.current.order = next;
        setOrder(next);
      }
    };
    const end = () => {
      const s = state.current;
      if (!s) return;
      clearTimeout(s.timer);
      state.current = null;
      setDragging(null);
      const next = latest.current.order;
      if (s.active && next && next.join('\u0000') !== latest.current.items.join('\u0000')) latest.current.onReorder(next);
      latest.current.order = null;
      setOrder(null);
    };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    window.addEventListener('blur', end);
    document.addEventListener('visibilitychange', end);
    return () => {
      document.removeEventListener('touchmove', blockScroll);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      window.removeEventListener('blur', end);
      document.removeEventListener('visibilitychange', end);
    };
  }, []);

  const start = (item: string) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const touch = e.pointerType !== 'mouse';
    if (!touch) e.preventDefault(); // 避免拖曳時選取文字
    const s = { item, x: e.clientX, y: e.clientY, touch, timer: 0, active: false };
    if (touch) s.timer = window.setTimeout(() => { if (state.current === s) { s.active = true; setDragging(item); navigator.vibrate?.(10); } }, 300);
    state.current = s;
  };

  const shown = order ?? items;
  return (
    <span ref={wrapRef} className="contents">
      {shown.map((option) => (
        <span
          key={option}
          data-chip
          onPointerDown={start(option)}
          onContextMenu={(e) => { if (state.current) e.preventDefault(); }}
          title="拖曳可調整順序"
          className={`inline-flex cursor-grab touch-manipulation select-none items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-shadow [-webkit-touch-callout:none] ${
            dragging === option ? 'cursor-grabbing bg-[#2868d8] text-white shadow-lg ring-2 ring-[#2868d8]/30' : 'bg-[#e9eefc] text-[#2868d8]'
          }`}
        >
          {option}
          <button type="button" onClick={() => onRemove(option)} aria-label={`移除 ${option}`} className={dragging === option ? 'text-white/80' : 'text-[#88a8ea]'}>×</button>
        </span>
      ))}
    </span>
  );
}
