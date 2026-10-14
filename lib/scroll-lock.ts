// 彈窗開啟時鎖住背景捲動。用計數管理:多個彈窗同時開 / 關的順序不同時,也不會把 overflow:hidden 留在 body 上
// (留下來的話,手機上整頁會卡住、最上面被截掉也滑不回來)。
// 全站只能透過這裡鎖捲動;另外有保險:沒有彈窗開著卻還是鎖住時,碰觸、換頁、回到頁面都會自動解鎖。
let locks = 0;
let guardInstalled = false;

function releaseIfStale() {
  if (locks === 0 && document.body.style.overflow === 'hidden') document.body.style.overflow = '';
  if (locks === 0 && document.documentElement.style.overflow === 'hidden') document.documentElement.style.overflow = '';
}

export function installGuard() {
  if (guardInstalled || typeof window === 'undefined') return;
  guardInstalled = true;
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerup', releaseIfStale, opts);
  window.addEventListener('touchend', releaseIfStale, opts);
  window.addEventListener('pageshow', releaseIfStale);
  window.addEventListener('popstate', releaseIfStale);
  document.addEventListener('visibilitychange', releaseIfStale);
}

export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
  installGuard();
  locks += 1;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = '';
  };
}
