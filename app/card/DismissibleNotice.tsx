'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

// 可以按 X 關掉的提示。
// 沒給 sessionKey:只在這次顯示時關閉,重新整理或重新進入頁面就會再出現。
// 有給 sessionKey:這次瀏覽期間都保持關閉(換頁也不出現),關掉瀏覽器 / 新開網頁後才再出現。
export default function DismissibleNotice({ children, label, className = '', sessionKey }: {
  children: ReactNode; label: string; className?: string; sessionKey?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!sessionKey) return;
    let hidden = false;
    try {
      hidden = sessionStorage.getItem(sessionKey) === '1';
    } catch {
      hidden = false;
    }
    if (hidden) Promise.resolve().then(() => setDismissed(true));
  }, [sessionKey]);

  function dismiss() {
    setDismissed(true);
    if (sessionKey) {
      try {
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        // 無法儲存(隱私模式):只關閉這一次
      }
    }
    // 版面高度變了:讓依位置計算的效果(例如首頁主視覺)重新計算
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  if (dismissed) return null;
  return <div className={`relative ${className}`}>
    {children}
    <button type="button" aria-label={label} title={label} onClick={dismiss}
      className="absolute right-1 top-1 z-50 grid h-10 w-10 cursor-pointer place-items-center rounded-full text-inherit transition hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
      <X size={18} aria-hidden="true" />
    </button>
  </div>;
}
