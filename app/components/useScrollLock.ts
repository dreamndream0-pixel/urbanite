'use client';

import { useEffect } from 'react';
import { lockScroll } from '@/lib/scroll-lock';

export function useScrollLock(active: boolean) {
  useEffect(() => { if (active) return lockScroll(); }, [active]);
}
