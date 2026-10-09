import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    ] }];
  },
  // 個人名片頁:對外網址 /@代稱,實際頁面在 /card/代稱
  async rewrites() {
    return [{ source: '/@:slug', destination: '/card/:slug' }];
  },
};

export default nextConfig;
