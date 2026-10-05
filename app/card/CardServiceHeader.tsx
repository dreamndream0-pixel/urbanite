import Link from 'next/link';

// 名片服務的頁首(介紹頁、我的名片、升級頁共用)
export default function CardServiceHeader({ logoUrl, loggedIn, current }: { logoUrl: string; loggedIn: boolean; current?: 'mycard' | 'upgrade' }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/card" className="flex items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="URBANITE" className="h-6 w-auto object-contain" /> : <span className="text-sm font-bold tracking-[0.2em]">URBANITE</span>}
          <span className="border-l border-[#d7c9bd] pl-2 text-xs tracking-[0.2em] text-[#6b6156]">名片</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {loggedIn ? (
            <>
              <Link href="/mycard" className={`rounded-full px-3 py-1.5 ${current === 'mycard' ? 'bg-[#1f1b19] text-white' : 'text-[#5f5852] hover:bg-[#efe8dd]'}`}>我的名片</Link>
              <Link href="/mycard/upgrade" className={`rounded-full px-3 py-1.5 ${current === 'upgrade' ? 'bg-[#1f1b19] text-white' : 'text-[#5f5852] hover:bg-[#efe8dd]'}`}>方案</Link>
              <Link href="/account" className="hidden rounded-full px-3 py-1.5 text-[#5f5852] hover:bg-[#efe8dd] sm:inline">會員中心</Link>
            </>
          ) : (
            <>
              <Link href="/card#pricing" className="hidden rounded-full px-3 py-1.5 text-[#5f5852] hover:bg-[#efe8dd] sm:inline">方案</Link>
              <Link href="/login?next=/mycard" className="rounded-full bg-[#1f1b19] px-4 py-1.5 font-medium text-white">登入 / 註冊</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
