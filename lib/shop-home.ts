import { useEffect, useState } from 'react';

// 記住顧客目前所在的「商店首頁」:主站為 '/',活動頁為 '/promo/<slug>'。
// 購物車/結帳頁的「回商店」與 Logo 會依此帶回原本的商店。
const SHOP_HOME_KEY = 'shop_home';

// 活動頁:另外寫一個 2 小時的 cookie(promo_home),proxy 會把站內任何回到 "/" 的連結轉回這個活動頁,
// 顧客不會被帶回官網首頁;要看官網首頁可用 /?main=1。回到官網首頁(href = '/')時清除。
export const PROMO_HOME_COOKIE = 'promo_home';

export function setShopHome(href: string, lockPromo = false) {
  try {
    window.sessionStorage.setItem(SHOP_HOME_KEY, href);
  } catch {
    /* sessionStorage 不可用時略過 */
  }
  try {
    const secure = location.protocol === 'https:' ? '; secure' : '';
    if (href.startsWith('/promo/') && lockPromo) document.cookie = `${PROMO_HOME_COOKIE}=${encodeURIComponent(href)}; path=/; max-age=7200; samesite=lax${secure}`;
    else if (href === '/') document.cookie = `${PROMO_HOME_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  } catch {
    /* cookie 不可用時略過 */
  }
}

export function getShopHome(): string {
  try {
    const href = window.sessionStorage.getItem(SHOP_HOME_KEY) ?? '';
    return href.startsWith('/') ? href : '/';
  } catch {
    return '/';
  }
}

// 用於客戶端元件:掛載後讀取目前商店首頁(伺服器端渲染時先用 '/')
export function useShopHome() {
  const [href, setHref] = useState('/');
  useEffect(() => {
    Promise.resolve().then(() => setHref(getShopHome()));
  }, []);
  return href;
}
