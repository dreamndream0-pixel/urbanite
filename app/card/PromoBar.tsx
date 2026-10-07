import Link from 'next/link';
import { getCardPromo, promoActive, promoDate } from '@/lib/card-promo';
import { tierInfo } from '@/lib/card-plan';

// 限時免費公告條(介紹頁、我的名片、方案頁共用);活動沒有進行時不顯示
export default async function PromoBar({ href, cta = '立即免費使用' }: { href?: string; cta?: string }) {
  const promo = await getCardPromo();
  if (!promoActive(promo)) return null;
  const name = tierInfo(promo.tier).name;
  return (
    <div className="relative z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#121b33] px-4 py-2.5 text-center text-[13px] text-white">
      <span className="rounded-full bg-[#dcbc84] px-2 py-0.5 text-[11px] font-bold text-[#121b33]">限時免費</span>
      <span>
        {promo.note || `${name} 全部功能免費開放`}・至 {promoDate(promo.end)}
      </span>
      {href ? (
        <Link href={href} className="font-semibold text-[#dcbc84] underline underline-offset-4">
          {cta} →
        </Link>
      ) : null}
    </div>
  );
}
