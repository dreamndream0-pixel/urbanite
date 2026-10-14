'use client';

import { useEffect } from 'react';
import { acquireScrollLock } from '@/lib/scroll-lock';

export function useScrollLock(active: boolean) {
  useEffect(() => { if (active) return acquireScrollLock(); }, [active]);
}
