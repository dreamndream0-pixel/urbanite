import type { Metadata, Viewport } from 'next';
import { getPosUser } from '@/lib/pos-auth';
import { getCurrentShop } from '@/lib/shop';
import PosApp from './PosApp';
import PosLogin from './PosLogin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'POS 門市結帳' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// POS 門市結帳:員工用後台建立的「員工編號 + 密碼」登入;管理員已登入後台時可以直接進來。
// ?login=1:換人登入(管理員的裝置上讓員工用自己的編號登入)
export default async function PosPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const switching = (await searchParams).login === '1';
  const user = await getPosUser({ staffOnly: switching });
  if (!user) {
    const shop = await getCurrentShop();
    return <PosLogin shopName={shop?.name ?? ''} />;
  }
  return <PosApp />;
}
