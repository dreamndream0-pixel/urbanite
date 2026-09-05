import type { Metadata } from 'next';
import './globals.css';
import DialogHost from './components/DialogHost';

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        {children}
        <DialogHost />
      </body>
    </html>
  );
}
