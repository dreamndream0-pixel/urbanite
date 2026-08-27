import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Goodnight Girls | LOVE LOVE LOVE',
  description: 'A boutique shopping cart and admin demo for LOVE LOVE LOVE gift sets.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
