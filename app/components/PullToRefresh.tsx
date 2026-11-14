'use client';

import { useEffect, useRef, useState } from 'react';
import { bodyScrolls, getScrollY } from '@/lib/page-scroll';

// 下拉重新整理:iPhone Chrome / App 內建瀏覽器改成 body 捲動後(見 lib/page-scroll.ts),瀏覽器內建的下拉重新整理失效,
// 這裡自己做一個。只在頁面捲到最頂端、沒有彈窗或選單鎖住捲動時才作用;其他瀏覽器不啟用(用瀏覽器自己的)。
const TRIGGER = 70; // 拉超過這個距離放開就重新整理(px,已含阻尼)
const MAX = 110;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);

  useEffect(() => {
    const standalone = () => (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (!(bodyScrolls() || standalone())) return;
    const body = document.body;
    const target: HTMLElement | Document = bodyScrolls() ? body : document; // standalone 且 html 捲動時掛在 document
    let startY: number | null = null;
    let pulling = false;

    const locked = () => body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden';
    // 手指下面有其他已經往下捲過的區塊(例如商品圖、橫向列表以外的內層捲動)→ 不攔截
    const innerScrolled = (target: EventTarget | null) => {
      for (let el = target as HTMLElement | null; el && el !== body && el !== document.documentElement; el = el.parentElement) {
        if (el.scrollTop > 0) return true;
        if (getComputedStyle(el).position === 'fixed') return true; // 彈窗、抽屜內不觸發
      }
      return false;
    };
    const set = (v: number) => { pullRef.current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      if (!(bodyScrolls() || standalone()) || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]')) || e.touches.length !== 1 || getScrollY() > 0 || locked() || innerScrolled(e.target)) { startY = null; return; }
      startY = e.touches[0].clientY;
      pulling = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (dy < 6 || getScrollY() > 0) { if (dy < 0) startY = null; return; }
        pulling = true;
      }
      e.preventDefault(); // 拉動時不要讓頁面彈跳
      set(Math.min(MAX, Math.max(0, dy * 0.5)));
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (!pulling) return;
      pulling = false;
      if (pullRef.current >= TRIGGER) {
        setRefreshing(true);
        set(TRIGGER);
        window.location.reload();
      } else set(0);
    };

    target.addEventListener('touchstart', onStart as EventListener, { passive: true });
    target.addEventListener('touchmove', onMove as EventListener, { passive: false });
    target.addEventListener('touchend', onEnd);
    target.addEventListener('touchcancel', onEnd);
    return () => {
      target.removeEventListener('touchstart', onStart as EventListener);
      target.removeEventListener('touchmove', onMove as EventListener);
      target.removeEventListener('touchend', onEnd);
      target.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (!pull && !refreshing) return null;
  const ready = pull >= TRIGGER;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center" style={{ transform: `translateY(${pull - 44}px)`, transition: pull ? 'none' : 'transform .2s ease' }} aria-hidden="true">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1f1b19] shadow-lg ring-1 ring-black/5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className={refreshing ? 'animate-spin' : ''} style={refreshing ? undefined : { transform: `rotate(${ready ? 180 : (pull / TRIGGER) * 180}deg)`, transition: 'transform .15s' }}>
          {refreshing ? <path d="M21 12a9 9 0 1 1-6.2-8.55" /> : <><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></>}
        </svg>
      </span>
    </div>
  );
}
