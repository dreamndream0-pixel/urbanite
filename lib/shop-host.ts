// 由網址判斷店家(不碰資料庫,middleware 也能用)
export const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'urbanite.com.tw').toLowerCase();

// 從網址主機名稱判斷是哪家店:回傳子網域代稱;主網域回傳 ''
export function shopSlugFromHost(host: string | null | undefined) {
  const h = String(host ?? '').toLowerCase().split(':')[0].trim();
  if (!h) return '';
  const root = ROOT_DOMAIN;
  for (const base of [root, 'localhost']) {
    if (h.endsWith(`.${base}`)) {
      const sub = h.slice(0, -(base.length + 1));
      if (!sub || sub === 'www' || sub.includes('.')) return '';
      return sub;
    }
  }
  return '';
}
