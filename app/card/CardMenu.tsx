'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';

type Me = { email: string; name: string } | null;

// 名片服務的漢堡選單:我的名片 / 方案 / 登入登出都收在這裡;links = 額外的導覽連結(介紹頁用)
// variant="header":放在頁首;variant="floating":公開名片右上角的半透明圓鈕
export default function CardMenu({
  variant = 'header',
  loggedIn,
  current,
  top = 12,
  links = [],
}: {
  variant?: 'header' | 'floating';
  loggedIn?: boolean; // 伺服器已知登入狀態就直接帶入,沒帶就自己查
  current?: 'mycard' | 'upgrade' | 'login';
  top?: number;
  links?: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | undefined>(loggedIn === false ? null : undefined);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loggedIn === false) return;
    fetch('/api/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data?.email ? { email: data.email, name: data.name ?? '' } : null))
      .catch(() => setMe(null));
  }, [loggedIn]);

  // 點選單外面或按 Esc 關閉
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    await createBrowserSupabase().auth.signOut();
    window.location.href = '/card';
  }

  const signedIn = me ? true : me === null ? false : Boolean(loggedIn);
  const item = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-[#1f1b19] text-white' : 'text-[#3d3530] hover:bg-[#f6f2ec]'}`;
  const floating = variant === 'floating';

  return (
    <div
      ref={box}
      className={floating ? 'fixed right-3 z-[60]' : 'relative ml-auto'}
      style={floating ? { top } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? '關閉選單' : '開啟選單'}
        aria-expanded={open}
        className={
          floating
            ? 'flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-[#1f1b19] shadow-[0_2px_10px_rgba(0,0,0,0.12)] backdrop-blur transition hover:bg-white/90'
            : 'flex h-10 w-10 items-center justify-center rounded-full text-[#1f1b19] transition hover:bg-[#efe8dd]'
        }
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-12 w-60 rounded-2xl border border-[#e5ded4] bg-white p-2 shadow-[0_12px_32px_rgba(31,27,25,0.16)]">
          {links.length ? (
            <>
              {links.map((l) => (
                <Link key={l.href + l.label} href={l.href} onClick={() => setOpen(false)} className={item(false)}>
                  {l.label}
                </Link>
              ))}
              <div className="my-1.5 border-t border-[#f0ebe3]" />
            </>
          ) : null}
          {signedIn ? (
            <>
              {me ? (
                <p className="truncate px-3 pb-2 pt-1.5 text-xs text-[#a99e8f]">{me.name || me.email}</p>
              ) : null}
              <Link href="/mycard" onClick={() => setOpen(false)} className={item(current === 'mycard')}>
                <MenuIcon d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0M7.5 16.5c.8-1.5 2-2.3 3.5-2.3s2.7.8 3.5 2.3" />
                我的名片
              </Link>
              <Link href="/mycard/upgrade" onClick={() => setOpen(false)} className={item(current === 'upgrade')}>
                <MenuIcon d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
                方案
              </Link>
              <Link href="/card" onClick={() => setOpen(false)} className={item(false)}>
                <MenuIcon d="M3 11l9-7 9 7M5 10v10h14V10" />
                URBANLINKS 首頁
              </Link>
              <div className="my-1.5 border-t border-[#f0ebe3]" />
              <button type="button" onClick={signOut} className={`${item(false)} w-full text-left`}>
                <MenuIcon d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
                登出
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 p-1">
                <Link href="/card/login" onClick={() => setOpen(false)} className="rounded-full border border-[#121b33] py-2 text-center text-sm font-semibold text-[#121b33]">登入</Link>
                <Link href="/card/register" onClick={() => setOpen(false)} className="rounded-full bg-[#121b33] py-2 text-center text-sm font-semibold text-[#dcbc84]">註冊</Link>
              </div>
              {links.length ? null : (
              <>
              <Link href="/card#pricing" onClick={() => setOpen(false)} className={item(false)}>
                <MenuIcon d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
                方案介紹
              </Link>
              <Link href="/card" onClick={() => setOpen(false)} className={item(false)}>
                <MenuIcon d="M3 11l9-7 9 7M5 10v10h14V10" />
                URBANLINKS 首頁
              </Link>
              </>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
