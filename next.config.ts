import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 個人名片頁:對外網址 /@代稱,實際頁面在 /card/代稱
  async rewrites() {
    return [{ source: '/@:slug', destination: '/card/:slug' }];
  },
};

export default nextConfig;
