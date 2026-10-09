import type { Metadata } from 'next';
import './globals.css';
import DialogHost from './components/DialogHost';
import { unstable_cache } from 'next/cache';
import { resolveSiteTheme, siteThemeCss } from '@/lib/site-theme';
import { getCurrentShop, isPlatformShop, scopedClient, shopUrl, URBANITE_SHOP_ID } from '@/lib/shop';

// 網站外觀(後台 系統設定 → 一般設定);每家店各自快取,儲存時會清除快取
const loadSiteTheme = unstable_cache(
  async (shopId: string) => {
    try {
      const { data } = await scopedClient(shopId).from('site_settings').select('site_theme').maybeSingle();
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

const PLATFORM_METADATA: Metadata = {
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

export async function generateMetadata(): Promise<Metadata> {
  const shop = await getCurrentShop();
  if (!shop || isPlatformShop(shop)) return PLATFORM_METADATA;
  const name = shop.name || shop.slug;
  const url = shopUrl(shop.slug);
  const description = `${name} 線上商店`;
  return {
    metadataBase: new URL(url),
    title: { default: name, template: `%s | ${name}` },
    description,
    icons: PLATFORM_METADATA.icons,
    openGraph: { title: name, description, url, siteName: name, locale: 'zh_TW', type: 'website', images: [{ ...SHARE_IMAGE, alt: name }] },
    twitter: { card: 'summary_large_image', title: name, description, images: [{ ...SHARE_IMAGE, alt: name }] },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shop = await getCurrentShop();
  const theme = await loadSiteTheme(shop?.id ?? URBANITE_SHOP_ID);
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
        {shop && shop.status !== 'suspended' ? (
          children
        ) : (
          // 網址打錯或店家已停用
          <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#5f5852', background: '#f6f2ec' }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 600, color: '#1f1b19' }}>{shop ? '這家店暫停營業中' : '找不到這家店'}</p>
              <p style={{ marginTop: 8, fontSize: 14 }}>請確認網址是否正確</p>
            </div>
          </main>
        )}
        <DialogHost />
      </body>
    </html>
  );
}
