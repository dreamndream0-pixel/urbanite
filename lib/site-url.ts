export const PRIMARY_SITE_URL = 'https://www.urbanite.com.tw';

function normalizeUrl(url: string) {
  return url.replace(/\/$/, '');
}

export function getConfiguredSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured || configured.includes('urbanite-tw.vercel.app')) {
    return PRIMARY_SITE_URL;
  }
  return normalizeUrl(configured);
}

// 店家子網域(slug.urbanite.com.tw):登入後要回到同一家店,不能轉回主網站
function isShopSubdomain(origin: string) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'urbanite.com.tw').toLowerCase();
    return host.endsWith(`.${root}`) && !host.startsWith('www.');
  } catch {
    return false;
  }
}

export function getBrowserAuthOrigin() {
  if (typeof window === 'undefined') return getConfiguredSiteUrl();
  const origin = window.location.origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1') || isShopSubdomain(origin)) return origin;
  return getConfiguredSiteUrl();
}

export function getServerRedirectOrigin(requestOrigin: string) {
  if (requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1') || isShopSubdomain(requestOrigin)) {
    return requestOrigin;
  }
  return getConfiguredSiteUrl();
}
