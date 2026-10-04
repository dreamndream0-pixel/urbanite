'use client';

import { useLineMember } from '@/app/components/useLineMember';

// 優惠券頁:還沒綁定 LINE 的會員,引導加好友並綁定(LINE 授權,一次完成)
export default function LineCouponBanner() {
  const [member] = useLineMember('/account?tab=coupons');
  if (!member.loaded || !member.loggedIn || member.bound || !member.linkUrl) return null;
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-[#cfe9d6] bg-[#f3fbf5] p-4 sm:gap-4 sm:p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#06C755] text-white">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 3.5C6.8 3.5 2.6 6.9 2.6 11.1c0 3.8 3.4 6.9 7.9 7.5.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.5s5.9-3.5 8-5.9c1.5-1.6 2.2-3.2 2.2-4.9 0-4.2-4.2-7.5-9.3-7.5z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1f5a33] sm:text-base">加入 LINE 好友領取優惠券</p>
        <p className="mt-0.5 text-xs leading-5 text-[#3d5a45]">綁定會員後,優惠活動第一時間通知,查詢訂單也更方便</p>
      </div>
      <a href={member.linkUrl} className="shrink-0 rounded-full bg-[#06C755] px-4 py-2 text-xs font-semibold text-white shadow-sm sm:text-sm">
        加入 LINE
      </a>
    </section>
  );
}
