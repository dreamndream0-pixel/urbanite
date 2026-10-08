import Link from 'next/link';
import { getCardPromo, promoActive } from '@/lib/card-promo';
import { TIERS, tierRank } from '@/lib/card-plan';
import DismissibleNotice from './DismissibleNotice';

// 限時免費公告條(介紹頁、我的名片、方案頁共用);活動沒有進行時不顯示
// 每一頁都可以按 X 關掉;這次瀏覽期間不再出現,新開網頁才會再顯示
export default async function PromoBar({ href, cta = '立即免費使用', dismissible = true }: { href?: string; cta?: string; dismissible?: boolean }) {
  const promo = await getCardPromo();
  if (!promoActive(promo)) return null;
  // 活動涵蓋的付費方案,例如「U Plus、U Pro、U Max」
  const name = TIERS.filter((t) => t.key !== 'free' && tierRank(t.key) <= tierRank(promo.tier)).map((t) => t.name).join('、');
  const banner = (
    <div className={`relative z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#121b33] py-2.5 text-center text-[13px] text-white ${dismissible ? 'pl-4 pr-12' : 'px-4'}`}>
      <span className="rounded-full bg-[#dcbc84] px-2 py-0.5 text-[11px] font-bold text-[#121b33]">限時免費</span>
      <span>
        {promo.note || `${name} 全部功能免費開放`}
      </span>
      {href ? (
        <Link href={href} className="font-semibold text-[#dcbc84] underline underline-offset-4">
          {cta} →
        </Link>
      ) : null}
    </div>
  );
  return dismissible ? <DismissibleNotice label="關閉限時免費公告" sessionKey="ul_promo_bar_hidden" className="bg-[#121b33] text-white">{banner}</DismissibleNotice> : banner;
}
