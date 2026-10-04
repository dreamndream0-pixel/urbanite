import type { Metadata } from 'next';
import './globals.css';
import DialogHost from './components/DialogHost';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSiteTheme, siteThemeCss } from '@/lib/site-theme';

// 網站外觀(後台 系統設定 → 一般設定);儲存時會清除快取
const loadSiteTheme = unstable_cache(
  async () => {
    try {
      const { data } = await createAdminClient().from('site_settings').select('site_theme').eq('id', 1).maybeSingle();
      return resolveSiteTheme(data?.site_theme);
    } catch {
      return resolveSiteTheme(null);
    }
  },
  ['site-theme'],
  { tags: ['site-theme'], revalidate: 3600 },
);

const DESCRIPTION = 'Urbanite 線上選品商店,提供流行服飾、配件與會員訂單查詢服務。';

// 分享縮圖使用合成的 1200×630 分享卡(/api/og),完整 logo 置中不裁切;換 logo 會自動更新。
const SHARE_IMAGE = { url: '/api/og', width: 1200, height: 630, alt: 'Urbanite' };

export const metadata: Metadata = {
  metadataBase: new URL('https://www.urbanite.com.tw'),
  title: {
    default: 'Urbanite',
    template: '%s | Urbanite',
  },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Urbanite',
    description: DESCRIPTION,
    url: 'https://www.urbanite.com.tw',
    siteName: 'Urbanite',
    locale: 'zh_TW',
    type: 'website',
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Urbanite',
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = await loadSiteTheme();
  return (
    <html
      lang="zh-Hant"
      data-card={theme.layout.card}
      data-columns={theme.layout.columns}
      data-radius={theme.layout.radius}
      data-heading={theme.layout.heading}
    >
      <head>
        <style id="site-theme" dangerouslySetInnerHTML={{ __html: siteThemeCss(theme) }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;600;700;900&family=Parisienne&display=swap"
        />
      </head>
      <body>
        {children}
        <DialogHost />
      </body>
    </html>
  );
}
