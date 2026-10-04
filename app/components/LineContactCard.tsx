'use client';

import { useEffect, useState } from 'react';
import type { SiteSettings } from '@/lib/types';
import { formatLineId, getCheckoutLine, lineAddFriendUrl } from '@/lib/checkout-line';
import { useLineMember } from '@/app/components/useLineMember';

// 訂單完成頁:引導加入官方 LINE 查詢出貨進度、聯絡客服(後台:系統設定 → 頁尾 → 結帳頁 LINE 設定)
// 已登入會員:LINE 授權加好友並自動綁定會員;已綁定:提示可在 LINE 查詢訂單;訪客:一般加好友
export default function LineContactCard({ settings }: { settings?: SiteSettings | null }) {
  const [fetched, setFetched] = useState<SiteSettings | null>(null);
  const [member] = useLineMember('/account?tab=orders');

  // 頁面沒傳入設定時自行讀取
  useEffect(() => {
    if (settings !== undefined) return;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SiteSettings | null) => setFetched(data))
      .catch(() => {});
  }, [settings]);

  const line = getCheckoutLine(settings === undefined ? fetched : settings);
  const href = lineAddFriendUrl(line);
  const lineId = formatLineId(line.id);
  if (!href) return null;

  const linkMember = member.loggedIn && !member.bound && member.linkUrl;
  if (member.loggedIn && member.bound) {
    return (
      <div className="mx-auto mt-6 max-w-sm rounded-xl border border-[#cfe9d6] bg-[#f3fbf5] p-4 text-center">
        <p className="text-sm font-semibold text-[#1f5a33]">✓ 已綁定官方 LINE</p>
        <p className="mt-1 text-sm leading-6 text-[#3d5a45]">到官方 LINE 輸入「訂單查詢」,即可查看這筆訂單的出貨進度</p>
        <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#05b14c]">
          <LineLogo />
          開啟官方 LINE
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-6 max-w-sm rounded-xl border border-[#cfe9d6] bg-[#f3fbf5] p-4 text-center">
      <p className="text-sm leading-6 text-[#3d5a45]">
        歡迎加入官方 LINE
        <br />
        {linkMember ? '加入好友並綁定會員,查詢訂單更方便,還能領取優惠券' : '查詢出貨進度,以及聯絡客服人員'}
      </p>
      {lineId && (
        <p className="mt-2 text-sm font-semibold text-[#1f5a33]">
          LINE ID：<span className="select-all">{lineId}</span>
        </p>
      )}
      <a
        href={linkMember ? member.linkUrl : href}
        {...(linkMember ? {} : { target: '_blank', rel: 'noreferrer' })}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#05b14c]"
      >
        <LineLogo />
        {linkMember ? '加入 LINE 並綁定會員' : '加入官方 LINE'}
      </a>
    </div>
  );
}

function LineLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#fff" />
      <path
        fill="#06C755"
        d="M24 9.5c-9.1 0-16.5 6-16.5 13.4 0 6.6 5.9 12.2 13.8 13.2.5.1 1.3.4 1.5.9.2.4.1 1.1.1 1.6l-.2 1.4c-.1.4-.3 1.6 1.4.9 1.7-.7 9.3-5.5 12.7-9.4 2.3-2.6 3.4-5.2 3.4-8.6C40.5 15.5 33.1 9.5 24 9.5z"
      />
      <path
        fill="#fff"
        d="M15.1 26.6h-3.3a.9.9 0 0 1-.9-.9v-6.5a.9.9 0 0 1 1.8 0v5.6h2.4a.9.9 0 0 1 0 1.8zm3.2-.9a.9.9 0 0 1-1.8 0v-6.5a.9.9 0 0 1 1.8 0v6.5zm7.9 0a.9.9 0 0 1-.6.9h-.3a.9.9 0 0 1-.7-.4l-3.3-4.5v4a.9.9 0 0 1-1.8 0v-6.5a.9.9 0 0 1 .6-.9h.3c.3 0 .5.1.7.4l3.4 4.5v-4a.9.9 0 0 1 1.8 0v6.5zm5.3-4.1a.9.9 0 0 1 0 1.8h-2.4v1.4h2.4a.9.9 0 0 1 0 1.8h-3.3a.9.9 0 0 1-.9-.9v-6.5c0-.5.4-.9.9-.9h3.3a.9.9 0 0 1 0 1.8h-2.4v1.5h2.4z"
      />
    </svg>
  );
}
