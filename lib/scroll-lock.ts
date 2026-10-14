// 彈窗開啟時鎖住背景捲動。用計數管理:多個彈窗同時開 / 關的順序不同時,也不會把 overflow:hidden 留在 body 上
// (留下來的話,手機上整頁會卡住、最上面被截掉也滑不回來)。
let locks = 0;

export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
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
