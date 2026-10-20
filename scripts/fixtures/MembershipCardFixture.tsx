'use client';

import LoyaltyManager from '@/app/admin/LoyaltyManager';
import CreditCard from '@/app/account/CreditCard';
import MembershipCard from '@/app/components/MembershipCard';
import { MEMBERSHIP_DESIGNS, resolveMembershipBenefits } from '@/lib/membership-card';

export default function MembershipCardFixture() {
  return <main className="mx-auto max-w-5xl space-y-8 p-4" style={{ '--c-text': '#242424', '--c-text2': '#666', '--c-surface': '#fff', '--c-brand': '#242424', '--c-muted': '#888' } as React.CSSProperties}>
    <section aria-label="會員中心"><CreditCard /></section>
    <section aria-label="會員後台"><LoyaltyManager /></section>
    <section aria-label="十款卡面預覽" className="grid min-w-0 gap-4 md:grid-cols-2">
      {MEMBERSHIP_DESIGNS.map((design, index) => <MembershipCard
        key={design.id}
        tier={{ key: design.id, name: index === 0 ? '極致尊榮鑽石黑金終身會員' : `${design.name}會員`, rate: 2, threshold: 3000, cardDesign: design.id, benefits: resolveMembershipBenefits(null) }}
        next={index === 9 ? null : { key: 'next', name: '下一個會員等級', threshold: 10000, rate: 3 }}
        spend={index === 0 ? 100000000 : index * 1000}
        toNext={Math.max(0, 10000 - index * 1000)}
        memberName={index === 0 ? '這是一個較長的會員姓名文字測試' : '王小美'} brandName="品牌會員"
      />)}
    </section>
  </main>;
}
