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

export function getBrowserAuthOrigin() {
  if (typeof window === 'undefined') return getConfiguredSiteUrl();
  const origin = window.location.origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return origin;
  return getConfiguredSiteUrl();
}

export function getServerRedirectOrigin(requestOrigin: string) {
  if (requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1')) {
    return requestOrigin;
  }
  return getConfiguredSiteUrl();
}
