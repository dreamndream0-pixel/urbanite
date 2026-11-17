import type { Metadata, Viewport } from 'next';
import { currentShopFeatures, getPosUser } from '@/lib/pos-auth';
import { getCurrentShop } from '@/lib/shop';
import PosApp from './PosApp';
import PosLogin from './PosLogin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'POS 門市結帳' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// POS 門市結帳:員工用後台建立的「員工編號 + 密碼」登入;管理員已登入後台時可以直接進來。
// ?login=1:換人登入(管理員的裝置上讓員工用自己的編號登入)
export default async function PosPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const features = await currentShopFeatures();
  if (!features.pos) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f6f2ec] p-6 text-center text-[#5f5852]">
        <div className="max-w-sm">
          <p className="text-lg font-semibold text-[#1f1b19]">這家店尚未開通 POS 門市結帳</p>
          <p className="mt-2 text-sm">如需使用,請聯絡平台開通。</p>
          <a href="/admin" className="mt-5 inline-block rounded-xl bg-[#1f1b19] px-5 py-2.5 text-sm font-semibold text-white">回後台</a>
        </div>
      </main>
    );
  }
  const switching = (await searchParams).login === '1' && features.staff;
  const user = await getPosUser({ staffOnly: switching });
  if (!user) {
    const shop = await getCurrentShop();
    return <PosLogin shopName={shop?.name ?? ''} />;
  }
  return <PosApp />;
}
