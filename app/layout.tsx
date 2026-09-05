import type { Metadata } from 'next';
import './globals.css';
import DialogHost from './components/DialogHost';
import { createAdminClient } from '@/lib/supabase/admin';

const DESCRIPTION = 'Urbanite 線上選品商店,提供流行服飾、配件與會員訂單查詢服務。';

// 分享網址時的縮圖(og:image)取自後台設定的商店 logo,換 logo 後縮圖也會跟著換。
async function getShareImage(): Promise<string> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from('site_settings').select('logo_url').eq('id', 1).maybeSingle();
    return data?.logo_url || '';
  } catch {
    return '';
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const logo = await getShareImage();
  const images = logo ? [{ url: logo, alt: 'Urbanite' }] : undefined;
  return {
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
      images,
    },
    twitter: {
      card: 'summary',
      title: 'Urbanite',
      description: DESCRIPTION,
      images,
    },
  };
}

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
