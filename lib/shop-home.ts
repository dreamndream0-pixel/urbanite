import { useEffect, useState } from 'react';

// 記住顧客目前所在的「商店首頁」:主站為 '/',活動頁為 '/promo/<slug>'。
// 購物車/結帳頁的「回商店」與 Logo 會依此帶回原本的商店。
const SHOP_HOME_KEY = 'shop_home';

export function setShopHome(href: string) {
  try {
    window.sessionStorage.setItem(SHOP_HOME_KEY, href);
  } catch {
    /* sessionStorage 不可用時略過 */
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
