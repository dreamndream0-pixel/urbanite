'use client';

import { useEffect } from 'react';

// iPhone 上 Safari 以外的瀏覽器(Chrome、App 內建瀏覽器):sticky 頁首會因網址列伸縮而算錯位置、切到內容,
// 改成 position: fixed 一直固定在最上方,body 留出頁首高度(--hh),內容從頁首下方開始、在頁首底下捲動。
// Safari 等其他瀏覽器維持原本的 sticky 頁首。data-browser 由 app/layout.tsx 的內嵌腳本設定;樣式在 globals.css(html.headroom)。
export default function HeadroomHeader() {
  useEffect(() => {
    const root = document.documentElement;
    const browser = root.getAttribute('data-browser');
    if (browser !== 'ios-chrome' && browser !== 'ios-other') return;
    const narrow = window.matchMedia('(max-width: 1023px)');

    let header: HTMLElement | null = null;
    let resize: ResizeObserver | null = null;

    // 找目前頁面的頁首,量高度給 body 留位置(換頁、頁首高度改變時重新量)
    const attach = () => {
      const next = narrow.matches ? document.querySelector<HTMLElement>('.page-header') : null;
      root.classList.toggle('headroom', !!next);
      if (next === header) return;
      resize?.disconnect();
      header = next;
      if (!header) { root.style.removeProperty('--hh'); return; }
      const measure = () => {
        if (header) root.style.setProperty('--hh', `${header.offsetHeight}px`);
      };
      measure();
      resize = new ResizeObserver(measure);
      resize.observe(header);
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
    narrow.addEventListener('change', attach);
    return () => {
      observer.disconnect();
      resize?.disconnect();
      narrow.removeEventListener('change', attach);
      root.classList.remove('headroom');
      root.style.removeProperty('--hh');
    };
  }, []);
  return null;
}
