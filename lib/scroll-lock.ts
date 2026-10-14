const locks = new Set<symbol>();
let restore: (() => void) | undefined;

// All overlays share ownership, so closing them out of order cannot leave
// overflow:hidden behind or unlock a still-open dialog. Never fix body position.
export function acquireScrollLock() {
  const token = Symbol('scroll-lock');
  if (!locks.size) {
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
