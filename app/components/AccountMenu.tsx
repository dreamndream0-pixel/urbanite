'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';

type Me = { email: string; name: string; isAdmin: boolean } | null;

// 全站共用的「我的帳號」人頭 + 下拉選單(內容與首頁一致)。
// 選單用 portal 掛到 document.body:若直接巢狀在 sticky header(z-30)底下,
// 不管內層 z-index 設多高,都跳不出 header 自己的疊層層級,會被購物車等
// z-50 的抽屜蓋住。掛到 body 才能讓「後開啟的視窗蓋在最上層」全站一致。
export default function AccountMenu({ nextPath = '/account' }: { nextPath?: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.email) setMe({ email: data.email, name: data.name ?? '', isAdmin: Boolean(data.isAdmin) });
        else setMe(null);
      })
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    reposition();
    // 選單開著時視窗捲動/縮放會讓定位跑掉,直接收起選單(常見且安全的做法)
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.refresh();
  }

  function toggleOpen() {
    if (!me) { router.push(`/login?next=${encodeURIComponent(nextPath)}`); return; }
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen((v) => !v);
  }

  const menu = open && me ? (
    <>
      <button aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-[9998] cursor-default" />
      <div
        style={{ position: 'fixed', top: pos.top, right: pos.right }}
        className="z-[9999] w-52 rounded-lg border border-[#e5ded4] bg-white p-2 shadow-lg"
      >
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
        <Link href="/account?tab=profile" onClick={() => setOpen(false)} className="block rounded px-3 py-2 text-sm hover:bg-[#f6f2ec]">
          我的帳戶
        </Link>
        <Link href="/account?tab=orders" onClick={() => setOpen(false)} className="block rounded px-3 py-2 text-sm hover:bg-[#f6f2ec]">
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
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggleOpen}
        aria-label="我的帳號"
        className="rounded-md p-2 hover:bg-[#efe8dd]"
      >
        <IconUser />
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
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
