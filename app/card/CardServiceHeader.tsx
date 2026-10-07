import Link from 'next/link';
import { SERVICE_LOGO, SERVICE_NAME } from '@/lib/card-plan';
import CardMenu from './CardMenu';

// 名片服務的頁首(我的名片、升級頁、設定頁共用);品牌 URBANLINKS,與商店 Logo 分開
// 右上角的按鈕都收進漢堡選單(我的名片 / 方案 / 會員中心 / 登入登出)
export default function CardServiceHeader({ loggedIn, current }: { logoUrl?: string; loggedIn: boolean; current?: 'mycard' | 'upgrade' | 'login' }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/card" className="flex items-center gap-2">
          <img src={SERVICE_LOGO} alt={SERVICE_NAME} className="h-[18px] w-auto object-contain sm:h-5" />
        </Link>
        <CardMenu loggedIn={loggedIn} current={current} />
      </div>
    </header>
  );
}
