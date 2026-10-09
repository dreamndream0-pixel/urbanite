'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { clearToast, getToast, subscribeToast } from '@/lib/ui-toast';

// 畫面正中央的膠囊提示,3 秒內淡出
export default function ToastHost() {
  const toast = useSyncExternalStore(subscribeToast, getToast, () => null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => clearToast(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-6" role="status" aria-live="polite">
      <div key={toast.id} className="ui-toast rounded-full bg-[#1f1b19]/90 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur">
        {toast.message}
      </div>
    </div>
  );
}
