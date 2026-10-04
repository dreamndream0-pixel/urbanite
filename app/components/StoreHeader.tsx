'use client';

import Link from 'next/link';
import type { Ref } from 'react';
import AccountMenu from '@/app/components/AccountMenu';

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'URBANITE';

// 前台表頭(首頁、活動頁、商品頁共用):左 選單+搜尋、中 Logo、右 收藏/購物車/會員
export default function StoreHeader({
  homeHref,
  logoUrl,
  favoriteCount,
  cartCount,
  cartIconRef,
  searchOpen,
  query,
  onMenu,
  onSearchToggle,
  onQueryChange,
  onSearchSubmit,
  onFavorites,
  onCart,
}: {
  homeHref: string;
  logoUrl: string;
  favoriteCount: number;
  cartCount: number;
  cartIconRef?: Ref<HTMLButtonElement>;
  searchOpen: boolean;
  query: string;
  onMenu: () => void;
  onSearchToggle: () => void;
  onQueryChange: (value: string) => void;
  onSearchSubmit?: () => void;
  onFavorites: () => void;
  onCart: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 bg-[var(--c-header)]/95 backdrop-blur">
      <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6 sm:py-5">
        {/* 左:漢堡選單 + 搜尋 */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={onMenu} aria-label="開啟選單" className="rounded-md p-1 text-[var(--c-text)] hover:bg-[var(--c-soft)]">
            <IconMenu />
          </button>
          <button onClick={onSearchToggle} aria-label="搜尋" className="rounded-md p-2 hover:bg-[var(--c-soft)]">
            <IconSearch />
          </button>
        </div>

        {/* 中:Logo(載入完成前先留白,避免先閃文字再換成 Logo 圖)*/}
        <Link href={homeHref} className="justify-self-center px-2 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={STORE_NAME} className="site-logo mx-auto h-8 w-auto object-contain sm:h-10" />
          ) : (
            <span className="inline-block h-8 w-28 sm:h-10 sm:w-36" aria-hidden />
          )}
        </Link>

        {/* 右:圖示列 */}
        <HeaderIcons
          favoriteCount={favoriteCount}
          cartCount={cartCount}
          cartIconRef={cartIconRef}
          onFavorites={onFavorites}
          onCart={onCart}
        />
      </nav>

      {/* 搜尋列 */}
      {searchOpen && (
        <div className="border-t border-[var(--c-border)] bg-[var(--c-header)]">
          <form
            className="mx-auto max-w-7xl px-4 py-3 sm:px-6"
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit?.();
            }}
          >
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="搜尋商品…"
              className="w-full rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-5 py-2.5 text-sm outline-none focus:border-[#c9a] "
            />
          </form>
        </div>
      )}
    </header>
  );
}

// 表頭右側圖示(收藏/購物車/會員):首頁、活動頁、商品頁、會員中心、結帳頁共用
export function HeaderIcons({
  favoriteCount,
  cartCount,
  cartIconRef,
  favoriteActive = false,
  onFavorites,
  onCart,
}: {
  favoriteCount: number;
  cartCount: number;
  cartIconRef?: Ref<HTMLButtonElement>;
  favoriteActive?: boolean;
  onFavorites: () => void;
  onCart: () => void;
}) {
  const heartOn = favoriteActive || favoriteCount > 0;
  return (
    <div className="flex items-center justify-end gap-1 sm:gap-2">
      <button
        onClick={onFavorites}
        aria-label="收藏清單"
        className={`relative rounded-md p-2 hover:bg-[var(--c-soft)] ${heartOn ? 'text-[var(--c-sale)]' : ''}`}
      >
        <IconHeart filled={heartOn} />
        {favoriteCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--c-sale)] px-1 text-[10px] font-semibold text-white transition-opacity duration-150">
            {favoriteCount}
          </span>
        )}
      </button>
      <button ref={cartIconRef} onClick={onCart} aria-label="購物車" className="relative rounded-md p-2 hover:bg-[var(--c-soft)]">
        <IconBag />
        {cartCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--c-sale)] px-1 text-[10px] font-semibold text-white">
            {cartCount}
          </span>
        )}
      </button>
      <AccountMenu nextPath="/account" />
    </div>
  );
}

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" strokeLinecap="round" />
    </svg>
  );
}
function IconHeart({ filled = false }: { filled?: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7.2-4.5-9.2-9.1C1.3 8.5 3.4 5 7 5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.7 3.5 4.2 6.9C19.2 16.5 12 21 12 21z" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.7" />
      <circle cx="18" cy="20" r="1.7" />
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7" />
      <path d="M8 8h13" />
    </svg>
  );
}
