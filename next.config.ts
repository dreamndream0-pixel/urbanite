import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: '/**' }],
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL ? [{ protocol: 'https', hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, pathname: '/storage/v1/object/public/assets/**' }] : [],
  },
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
    return [
      { source: '/@:slug', destination: '/card/:slug' },
      // 名片線上預約頁
      { source: '/@:slug/book', destination: '/card/:slug/book' },
    ];
  },
};

export default nextConfig;
