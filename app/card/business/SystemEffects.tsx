'use client';

import { useEffect } from 'react';

export default function SystemEffects() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('[data-system-page]');
    if (!page) return;
    page.setAttribute('data-motion-ready', 'true');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealItems = Array.from(page.querySelectorAll<HTMLElement>('[data-reveal]'));
    const navLinks = Array.from(page.querySelectorAll<HTMLAnchorElement>('[data-section-link]'));
    const sections = navLinks
      .map((link) => document.querySelector<HTMLElement>(link.hash))
      .filter((section): section is HTMLElement => Boolean(section));

    if (reducedMotion) {
      revealItems.forEach((item) => item.setAttribute('data-visible', 'true'));
    }

    const revealObserver = reducedMotion
      ? null
      : new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.setAttribute('data-visible', 'true');
              revealObserver?.unobserve(entry.target);
            });
          },
          { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
        );

    revealItems.forEach((item) => revealObserver?.observe(item));

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        navLinks.forEach((link) => {
          const active = link.hash === `#${visible.target.id}`;
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.2, 0.6] },
    );
    sections.forEach((section) => sectionObserver.observe(section));

    const updateScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
      page.style.setProperty('--scroll-progress', progress.toString());
    };
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });

    const tilt = page.querySelector<HTMLElement>('[data-tilt]');
    const moveTilt = (event: PointerEvent) => {
      if (!tilt || reducedMotion || event.pointerType === 'touch') return;
      const rect = tilt.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      tilt.style.setProperty('--tilt-x', `${(0.5 - y) * 3.4}deg`);
      tilt.style.setProperty('--tilt-y', `${(x - 0.5) * 4.2}deg`);
      tilt.style.setProperty('--pointer-x', `${x * 100}%`);
      tilt.style.setProperty('--pointer-y', `${y * 100}%`);
    };
    const resetTilt = () => {
      if (!tilt) return;
      tilt.style.setProperty('--tilt-x', '0deg');
      tilt.style.setProperty('--tilt-y', '0deg');
      tilt.style.setProperty('--pointer-x', '50%');
      tilt.style.setProperty('--pointer-y', '50%');
    };
    tilt?.addEventListener('pointermove', moveTilt);
    tilt?.addEventListener('pointerleave', resetTilt);

    return () => {
      revealObserver?.disconnect();
      sectionObserver.disconnect();
      window.removeEventListener('scroll', updateScroll);
      tilt?.removeEventListener('pointermove', moveTilt);
      tilt?.removeEventListener('pointerleave', resetTilt);
    };
  }, []);

  return null;
}
