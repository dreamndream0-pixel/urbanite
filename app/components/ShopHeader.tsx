'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AccountMenu from './AccountMenu';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';
const CART_KEY = 'cart';

type CartItem = {
  quantity: number;
};

type ShopHeaderProps = {
  logoUrl?: string;
  leftHref?: string;
  leftLabel?: string;
  cartCount?: number;
  favoriteCount?: number;
  favoriteActive?: boolean;
  onFavoriteClick?: () => void;
};

export default function ShopHeader({
  logoUrl = '',
  leftHref = '/',
  leftLabel = '← 回商店',
  cartCount,
  favoriteCount = 0,
  favoriteActive = false,
  onFavoriteClick,
}: ShopHeaderProps) {
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(logoUrl);
  const [localCartCount, setLocalCartCount] = useState(0);
  const shownCartCount = cartCount ?? localCartCount;
  const shownFavoriteActive = favoriteActive || favoriteCount > 0;

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

  const favoriteButton = useMemo(() => {
    const content = (
      <>
        <IconStar filled={shownFavoriteActive} />
        {favoriteCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c84767] px-1 text-[10px] font-semibold text-white">
            {favoriteCount}
          </span>
        )}
      </>
    );
    const className = 'relative rounded-md p-2 hover:bg-[#efe8dd]';
    if (onFavoriteClick) {
      return (
        <button type="button" onClick={onFavoriteClick} aria-label="收藏" className={className}>
          {content}
        </button>
      );
    }
    return (
      <Link href="/account" aria-label="收藏" className={className}>
        {content}
      </Link>
    );
  }, [favoriteCount, onFavoriteClick, shownFavoriteActive]);

  return (
    <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
      <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center">
          <Link href={leftHref} className="truncate text-sm text-[#6b6156] hover:text-[#1f1b19]">
            {leftLabel}
          </Link>
        </div>

        <Link href="/" className="justify-self-center px-2 text-center">
          {resolvedLogoUrl ? (
            <img src={resolvedLogoUrl} alt={STORE_NAME} className="mx-auto h-8 w-auto object-contain sm:h-10" />
          ) : (
            <span className="inline-block h-8 w-28 sm:h-10 sm:w-36" aria-hidden />
          )}
        </Link>

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          {favoriteButton}
          <Link href="/checkout" aria-label="購物車" className="relative rounded-md p-2 hover:bg-[#efe8dd]">
            <IconBag />
            {shownCartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c84767] px-1 text-[10px] font-semibold text-white">
                {shownCartCount}
              </span>
            )}
          </Link>
          <AccountMenu />
        </div>
      </nav>
    </header>
  );
}

function IconBag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 8h12l-1 12H7L6 8z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
    </svg>
  );
}

function IconStar({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? '#f5c542' : 'none'} stroke={filled ? '#d89a00' : 'currentColor'} strokeWidth="1.8" strokeLinejoin="round">
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1L12 2Z" />
    </svg>
  );
}
