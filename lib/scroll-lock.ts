const locks = new Set<symbol>();
let restore: (() => void) | undefined;
let guardInstalled = false;

function releaseIfStale() {
  if (locks.size) return;
  for (const element of [document.documentElement, document.body]) {
    if (element.style.getPropertyValue('overflow') === 'hidden') element.style.removeProperty('overflow');
  }
}

export function installGuard() {
  if (guardInstalled || typeof window === 'undefined') return;
  guardInstalled = true;
  const options = { capture: true, passive: true } as const;
  window.addEventListener('pointerup', releaseIfStale, options);
  window.addEventListener('touchend', releaseIfStale, options);
  window.addEventListener('pageshow', releaseIfStale);
  window.addEventListener('popstate', releaseIfStale);
  document.addEventListener('visibilitychange', releaseIfStale);
}

// All overlays share ownership, so closing them out of order cannot leave
// overflow:hidden behind or unlock a still-open dialog. Never fix body position.
export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
  installGuard();
  const token = Symbol('scroll-lock');
  if (!locks.size) {
    releaseIfStale();
    const elements = [document.documentElement, document.body];
    const snapshots = elements.map(element => ({ element,
      value: element.style.getPropertyValue('overflow'), priority: element.style.getPropertyPriority('overflow') }));
    for (const element of elements) element.style.setProperty('overflow', 'hidden');
    restore = () => {
      for (const { element, value, priority } of snapshots) {
        if (value) element.style.setProperty('overflow', value, priority);
        else element.style.removeProperty('overflow');
      }
    };
  }
  locks.add(token);
  return () => {
    if (!locks.delete(token) || locks.size) return;
    restore?.();
    restore = undefined;
  };
}
