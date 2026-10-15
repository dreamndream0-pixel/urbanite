'use client';

import { useEffect } from 'react';

// iPhone 上 Safari 以外的瀏覽器(Chrome、App 內建瀏覽器):sticky 頁首會因網址列伸縮而算錯位置,
// 改成「往下滑收起、往上滑出現」的固定頁首(position: fixed + 留出頁首高度),Safari 等其他瀏覽器不受影響。
// data-browser 由 app/layout.tsx 的內嵌腳本設定;樣式在 globals.css(html.headroom)。
const SHOW_NEAR_TOP = 8; // 捲到頁首高度以內一律顯示
const DELTA = 6; // 小於這個距離的抖動不切換

export default function HeadroomHeader() {
  useEffect(() => {
    const root = document.documentElement;
    const browser = root.getAttribute('data-browser');
    if (browser !== 'ios-chrome' && browser !== 'ios-other') return;
    const narrow = window.matchMedia('(max-width: 1023px)');

    let header: HTMLElement | null = null;
    let resize: ResizeObserver | null = null;
    let lastY = window.scrollY;
    let height = 0;

    const setHidden = (hidden: boolean) => root.classList.toggle('headroom-hidden', hidden);
    // 找目前頁面的頁首,量高度給 body 留位置(換頁、頁首高度改變時重新量)
    const attach = () => {
      const next = narrow.matches ? document.querySelector<HTMLElement>('.page-header') : null;
      root.classList.toggle('headroom', !!next);
      if (next === header) return;
      resize?.disconnect();
      header = next;
      height = 0;
      if (!header) { root.style.removeProperty('--hh'); setHidden(false); return; }
      const measure = () => {
        if (!header) return;
        height = header.offsetHeight;
        root.style.setProperty('--hh', `${height}px`);
      };
      measure();
      resize = new ResizeObserver(measure);
      resize.observe(header);
      setHidden(false);
    };
    const onScroll = () => {
      if (!header) return;
      const y = Math.max(0, window.scrollY);
      // 有彈窗鎖住捲動、或選單開著時不要收起
      const locked = root.style.overflow === 'hidden' || document.body.style.overflow === 'hidden';
      if (y <= height + SHOW_NEAR_TOP || locked) setHidden(false);
      else if (y - lastY > DELTA) setHidden(true);
      else if (lastY - y > DELTA) setHidden(false);
      if (Math.abs(y - lastY) > DELTA) lastY = y;
    };

    attach();
    // 站內換頁時頁首會換一個:監看 DOM 變化重新找(合併同一輪的多次變動)
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; attach(); }, 0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    narrow.addEventListener('change', attach);
    return () => {
      observer.disconnect();
      resize?.disconnect();
      window.removeEventListener('scroll', onScroll);
      narrow.removeEventListener('change', attach);
      root.classList.remove('headroom', 'headroom-hidden');
      root.style.removeProperty('--hh');
    };
  }, []);
  return null;
}
