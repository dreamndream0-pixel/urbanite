'use client';

import { useEffect } from 'react';
import { installGuard } from '@/lib/scroll-lock';

// 全站:頁面被殘留的捲動鎖卡住時(沒有彈窗開著卻滑不動),碰一下、換頁或回到頁面就自動解開
export default function ScrollLockGuard() {
  useEffect(() => installGuard(), []);
  return null;
}
