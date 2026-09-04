'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';

type Me = { email: string; name: string; isAdmin: boolean } | null;

// 全站共用的「我的帳號」人頭 + 下拉選單(內容與首頁一致)。
export default function AccountMenu({ nextPath = '/account' }: { nextPath?: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.email) setMe({ email: data.email, name: data.name ?? '', isAdmin: Boolean(data.isAdmin) });
        else setMe(null);
      })
      .catch(() => setMe(null));
  }, []);

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (!me) { router.push(`/login?next=${encodeURIComponent(nextPath)}`); return; }
          setOpen((v) => !v);
        }}
        aria-label="我的帳號"
        className="rounded-md p-2 hover:bg-[#efe8dd]"
      >
        <IconUser />
      </button>
      {open && me && (
        <>
          <button aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
          <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-[#e5ded4] bg-white p-2 shadow-lg">
            <div className="px-3 py-2">
              {me.name ? <p className="truncate text-sm font-medium">{me.name}</p> : null}
              <p className="truncate text-xs text-[#8a7f72]">{me.email}</p>
              {me.isAdmin && (
                <span className="mt-1 inline-block rounded-full bg-[#1f1b19] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                  主管理員
                </span>
              )}
            </div>
            {me.isAdmin && (
              <Link href="/admin" onClick={() => setOpen(false)} className="mb-1 block rounded bg-[#f3ede4] px-3 py-2 text-sm font-semibold hover:bg-[#ece2d5]">
                進入管理後台
              </Link>
            )}
            <Link href="/account" onClick={() => setOpen(false)} className="block rounded px-3 py-2 text-sm hover:bg-[#f6f2ec]">
              我的訂單
            </Link>
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-[#f6f2ec]"
            >
              登出
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}
