// 賣場流量追蹤(瀏覽器端):進站、商品點擊、商品頁瀏覽、加入購物車 → /api/shop-track
// visitor:存在 localStorage 的匿名代碼(不含個資);source:這次造訪的來源(第一次進站時判斷,同一次造訪沿用)
type TrackType = 'visit' | 'product_view' | 'product_click' | 'add_cart';
const VISITOR_KEY = 'shop_visitor';
const SOURCE_KEY = 'shop_source';

function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch { return ''; }
}

// 來源:網址上的 utm_source / fbclid / gclid,否則看從哪個網站點進來
function detectSource() {
  const q = new URLSearchParams(location.search);
  const utm = q.get('utm_source');
  if (utm) return utm.toLowerCase().slice(0, 40);
  if (q.has('fbclid')) return 'facebook';
  if (q.has('gclid')) return 'google';
  if (/Line\//i.test(navigator.userAgent)) return 'line';
  if (/Instagram/i.test(navigator.userAgent)) return 'instagram';
  if (/FBAN|FBAV/i.test(navigator.userAgent)) return 'facebook';
  let host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch { host = ''; }
  if (!host || host === location.hostname) return 'direct';
  if (/google\./.test(host)) return 'google';
  if (/facebook\.|fb\./.test(host)) return 'facebook';
  if (/instagram\./.test(host)) return 'instagram';
  if (/line\.me|line\.naver/.test(host)) return 'line';
  if (/threads\./.test(host)) return 'threads';
  if (/youtube\./.test(host)) return 'youtube';
  if (/urbanite\.com\.tw$/.test(host)) return 'urbanlinks';
  return host.replace(/^www\./, '').slice(0, 40);
}

function sessionSource() {
  try {
    let s = sessionStorage.getItem(SOURCE_KEY);
    if (!s) { s = detectSource(); sessionStorage.setItem(SOURCE_KEY, s); }
    return s;
  } catch { return detectSource(); }
}

export function trackShop(type: TrackType, extra: { product_id?: string; campaign_id?: string | null; page?: string } = {}) {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({ type, ...extra, source: sessionSource(), visitor: visitorId() });
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/shop-track', blob)) void fetch('/api/shop-track', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch { /* 追蹤失敗不影響購物 */ }
}

// 進站:同一次造訪(分頁 session)同一個賣場頁只算一次
export function trackShopVisit(page: string, campaignId?: string | null) {
  try {
    const key = `shop_visit:${page}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* 略過 */ }
  trackShop('visit', { page, campaign_id: campaignId ?? null });
}
