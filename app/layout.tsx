import type { Metadata } from 'next';
import './globals.css';
import DialogHost from './components/DialogHost';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.urbanite.com.tw'),
  title: {
    default: 'Urbanite',
    template: '%s | Urbanite',
  },
  description: 'Urbanite 線上選品商店,提供流行服飾、配件與會員訂單查詢服務。',
  openGraph: {
    title: 'Urbanite',
    description: 'Urbanite 線上選品商店,提供流行服飾、配件與會員訂單查詢服務。',
    url: 'https://www.urbanite.com.tw',
    siteName: 'Urbanite',
    locale: 'zh_TW',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Urbanite',
    description: 'Urbanite 線上選品商店,提供流行服飾、配件與會員訂單查詢服務。',
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
