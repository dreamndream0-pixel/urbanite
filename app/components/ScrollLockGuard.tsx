'use client';

import { useEffect } from 'react';
import { installGuard } from '@/lib/scroll-lock';

// 全站:頁面被殘留的捲動鎖卡住時(沒有彈窗開著卻滑不動),碰一下、換頁或回到頁面就自動解開
export default function ScrollLockGuard() {
  useEffect(() => installGuard(), []);

  // iPhone 的 Chrome / Firefox / Edge:網址列收合、展開時 sticky 頁首會算錯位置,
  // 滑回頂部時蓋住內容。在頂部時讓頁首回到一般排版(html.at-top),往下捲才固定。
  useEffect(() => {
    if (!/(CriOS|FxiOS|EdgiOS)\//.test(navigator.userAgent)) return;
    const root = document.documentElement;
    root.classList.add('ios-alt-browser');
    const update = () => root.classList.toggle('at-top', window.scrollY <= 1);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.classList.remove('ios-alt-browser', 'at-top');
    };
  }, []);
  return null;
}
