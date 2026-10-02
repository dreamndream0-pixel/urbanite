'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HeaderIcons } from './StoreHeader';
import { useShopHome } from '@/lib/shop-home';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';
const CART_KEY = 'cart';

type CartItem = {
  quantity: number;
};

type ShopHeaderProps = {
  logoUrl?: string;
  leftHref?: string;
  leftLabel?: string;
  showBack?: boolean;
  logoLinked?: boolean;
  cartCount?: number;
  favoriteCount?: number;
  favoriteActive?: boolean;
  onFavoriteClick?: () => void;
};

// 內頁表頭(會員中心、結帳、頁尾內文頁):左側回商店,右側圖示與首頁相同
export default function ShopHeader({
  logoUrl = '',
  leftHref,
  leftLabel = '← 回商店',
  showBack = true,
  logoLinked = true,
  cartCount,
  favoriteCount,
  favoriteActive = false,
  onFavoriteClick,
}: ShopHeaderProps) {
  const router = useRouter();
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(logoUrl);
  // 未指定時回到顧客原本所在的商店(主站或活動頁)
  const shopHome = useShopHome();
  const backHref = leftHref ?? shopHome;
  const [localCartCount, setLocalCartCount] = useState(0);
  const [localFavoriteCount, setLocalFavoriteCount] = useState(0);
  const shownCartCount = cartCount ?? localCartCount;
  const shownFavoriteCount = favoriteCount ?? localFavoriteCount;

  useEffect(() => {
    if (logoUrl) {
      setResolvedLogoUrl(logoUrl);
      return;
    }
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (settings?.logo_url) setResolvedLogoUrl(settings.logo_url);
      })
      .catch(() => {});
  }, [logoUrl]);

  useEffect(() => {
    if (typeof cartCount === 'number') return;
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      const items: CartItem[] = raw ? JSON.parse(raw) : [];
      setLocalCartCount(items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0));
    } catch {
      setLocalCartCount(0);
    }
  }, [cartCount]);

  // 頁面沒有提供收藏數時,自行讀取(未登入為 0)
  useEffect(() => {
    if (typeof favoriteCount === 'number') return;
    fetch('/api/favorites')
      .then((res) => (res.ok ? res.json() : { productIds: [] }))
      .then((data: { productIds?: string[] }) => setLocalFavoriteCount(data.productIds?.length ?? 0))
      .catch(() => {});
  }, [favoriteCount]);

  const logo = resolvedLogoUrl ? (
    <img src={resolvedLogoUrl} alt={STORE_NAME} className="mx-auto h-8 w-auto object-contain sm:h-10" />
  ) : (
    <span className="inline-block h-8 w-28 sm:h-10 sm:w-36" aria-hidden />
  );

  return (
    <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
      <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center">
          {showBack ? (
            <Link href={backHref} className="truncate text-sm text-[#6b6156] hover:text-[#1f1b19]">
              {leftLabel}
            </Link>
          ) : null}
        </div>

        {logoLinked ? (
          <Link href={backHref} className="justify-self-center px-2 text-center">
            {logo}
          </Link>
        ) : (
          <div className="justify-self-center px-2 text-center">{logo}</div>
        )}

        <HeaderIcons
          favoriteCount={shownFavoriteCount}
          favoriteActive={favoriteActive}
          cartCount={shownCartCount}
          onFavorites={onFavoriteClick ?? (() => router.push('/account?tab=favorites'))}
          onCart={() => router.push('/checkout')}
        />
      </nav>
    </header>
  );
}
