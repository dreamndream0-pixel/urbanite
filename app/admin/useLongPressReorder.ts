'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// 長按(手機)或拖曳把手(電腦)上下拖曳排序。列表每一列要加 data-sort-row;放開時呼叫 onDrop(新順序的 id)。
export function useLongPressReorder(ids: string[], onDrop: (ids: string[]) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<string[] | null>(null); // 拖曳中的暫時順序
  const [sorting, setSorting] = useState<string | null>(null);
  const state = useRef<{ id: string; x: number; y: number; timer: number; active: boolean } | null>(null);
  const latest = useRef({ ids, onDrop, order });
  useEffect(() => { latest.current = { ids, onDrop, order }; });

  useEffect(() => {
    // iOS 要在 touchmove 擋掉預設才不會捲動頁面(必須是 passive: false)
    const blockScroll = (e: TouchEvent) => { if (state.current?.active) e.preventDefault(); };
    const move = (e: PointerEvent) => {
      const s = state.current;
      if (!s) return;
      if (!s.active) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) { clearTimeout(s.timer); state.current = null; }
        return;
      }
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-sort-row]') ?? [])];
      const current = latest.current.order ?? latest.current.ids;
      const from = current.indexOf(s.id);
      let to = rows.findIndex((row) => { const r = row.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      if (to < 0) to = rows.length - 1;
      if (to > from) to -= 1;
      if (from >= 0 && to !== from) {
        const next = [...current];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        latest.current.order = next;
        setOrder(next);
      }
    };
    const end = () => {
      const s = state.current;
      if (!s) return;
      clearTimeout(s.timer);
      state.current = null;
      setSorting(null);
      const next = latest.current.order;
      if (s.active && next && next.join() !== latest.current.ids.join()) latest.current.onDrop(next);
      latest.current.order = null;
      setOrder(null);
    };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      document.removeEventListener('touchmove', blockScroll);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  // immediate:按住拖曳把手時立刻開始;否則長按 0.4 秒
  function start(e: ReactPointerEvent, id: string, immediate = false) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button,a,input,select,textarea') && !immediate) return;
    const activate = () => {
      if (!state.current) return;
      state.current.active = true;
      setSorting(id);
      navigator.vibrate?.(12);
    };
    state.current = { id, x: e.clientX, y: e.clientY, timer: immediate ? 0 : window.setTimeout(activate, 400), active: false };
    if (immediate) activate();
  }

  return { listRef, order: order ?? ids, sorting, start };
}
