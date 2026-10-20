// 頁面捲動的共用工具。
// iPhone 上 Safari 以外的瀏覽器(Chrome、App 內建瀏覽器)網址列伸縮時,固定頁首與內容的位置會對不上(內容被藏在頁首下),
// 所以在這些瀏覽器改由 <body> 自己捲動(html 不捲動 → 網址列不伸縮),見 globals.css 的 data-browser 規則。
// 讀寫捲動位置、監聽捲動請一律用這裡的函式,兩種模式都正確。
export function bodyScrolls() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.getAttribute('data-document-form') === 'membership') return false;
  const b = document.documentElement.getAttribute('data-browser');
  return b === 'ios-chrome' || b === 'ios-other';
}

export function getScrollY() {
  return bodyScrolls() ? document.body.scrollTop : window.scrollY;
}

export function scrollToY(y: number) {
  if (bodyScrolls()) document.body.scrollTo(0, y);
  else window.scrollTo(0, y);
}

// 可捲動的總高度與畫面高度(判斷是否捲到底)
export function scrollMetrics() {
  const el = bodyScrolls() ? document.body : document.documentElement;
  return { y: getScrollY(), height: el.scrollHeight, viewport: bodyScrolls() ? document.body.clientHeight : window.innerHeight };
}

// 監聽頁面捲動,回傳取消函式
export function onPageScroll(handler: () => void) {
  const target: HTMLElement | Window = bodyScrolls() ? document.body : window;
  target.addEventListener('scroll', handler, { passive: true });
  return () => target.removeEventListener('scroll', handler);
}
