// These endpoints authenticate provider callbacks in their own handlers.
const CALLBACKS = new Set([
  '/api/payment/newebpay/notify', '/api/payment/newebpay/return',
  '/api/card-plan/return', '/api/line/webhook',
  '/api/logistics/newebpay/notify', '/api/logistics/newebpay/store-map/return',
]);

export function requestSecurityError(request: Request): number | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > 8 * 1024 * 1024)) return 413;
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
  if (request.method === 'POST' && CALLBACKS.has(url.pathname.replace(/\/$/, ''))) return null;
  const origin = request.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).origin !== url.origin || origin === 'null') return 403; }
    catch { return 403; }
  }
  // Reject browser cross-site writes, including requests without an Origin.
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') return 403;
  if (!origin && site !== 'same-origin') return 403;
  return null;
}
