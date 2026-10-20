'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { bodyScrolls, getScrollY, scrollToY } from '@/lib/page-scroll';

// A native document scroller lets iOS focus inputs without panning a locked root
// independently of the site's nested body scroller. Restore the old mode on exit.
export function useMembershipFormScroll(form: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-document-form');
    const wasBody = bodyScrolls();
    const initialY = getScrollY();
    root.setAttribute('data-document-form', 'membership');
    if (wasBody) { document.body.scrollTop = 0; window.scrollTo(0, initialY); }
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement) || !field.matches('input:not([type="checkbox"]):not([type="file"]),textarea,select') || !form.current?.contains(field)) return;
        const viewport = window.visualViewport;
        const top = Math.max(viewport?.offsetTop ?? 0, document.querySelector('.page-header')?.getBoundingClientRect().bottom ?? 0) + 12;
        const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 16;
        const box = field.getBoundingClientRect();
        const delta = box.bottom > bottom ? box.bottom - bottom : box.top < top ? box.top - top : 0;
        if (Math.abs(delta) > 1) scrollToY(getScrollY() + delta);
      });
    };
    document.addEventListener('focusin', reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', reveal);
      window.visualViewport?.removeEventListener('resize', reveal);
      const y = getScrollY();
      if (previous === null) root.removeAttribute('data-document-form');
      else root.setAttribute('data-document-form', previous);
      if (wasBody) { window.scrollTo(0, 0); document.body.scrollTop = y; }
    };
  }, [form]);
}
