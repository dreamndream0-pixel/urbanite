'use client';

import { useEffect } from 'react';
import { installGuard } from '@/lib/scroll-lock';

// 全站:頁面被殘留的捲動鎖卡住時(沒有彈窗開著卻滑不動),碰一下、換頁或回到頁面就自動解開
// (iPhone Chrome 等瀏覽器的頁首處理改由 app/layout.tsx 的 data-browser 判斷 + globals.css)
export default function ScrollLockGuard() {
  useEffect(() => installGuard(), []);
  return null;
}
