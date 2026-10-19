'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ArrowRight, CalendarCheck, ChevronRight, CreditCard, House, LayoutDashboard, LogOut, Menu, Store, UserRound, X } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useScrollLock } from '@/app/components/useScrollLock';
import styles from './card-menu.module.css';

// 後台模式(例:線上預約管理):選單只放這個後台的功能 + 首頁 / 我的名片 / 升級官網
export type AppNav = { title: string; items: { href: string; label: string; active?: boolean }[] };

type Me = { email: string; name: string; isAdmin?: boolean; shops?: { slug: string; name: string; current: boolean; adminUrl: string }[] } | null;

export default function CardMenu({ variant = 'header', loggedIn, current, top = 12, links = [], appNav }: {
  variant?: 'header' | 'floating';
  loggedIn?: boolean;
  current?: 'mycard' | 'upgrade' | 'login' | 'booking';
  top?: number;
  links?: { href: string; label: string }[];
  appNav?: AppNav;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [me, setMe] = useState<Me | undefined>(loggedIn === false ? null : undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const id = useId();
  const router = useRouter();
  useScrollLock(open);

  useEffect(() => {
    if (loggedIn === false) return;
    const controller = new AbortController();
    fetch('/api/me', { cache: 'no-store', signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => setMe(data?.email ? { email: data.email, name: data.name ?? '', isAdmin: Boolean(data.isAdmin), shops: Array.isArray(data.shops) ? data.shops : [] } : null))
      .catch(() => { if (!controller.signal.aborted) setMe(null); });
    return () => controller.abort();
  }, [loggedIn]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  function closeMenu(callback?: () => void) {
    if (!dialog.current?.open || closing) return;
    afterClose.current = callback ?? null;
    setClosing(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) dialog.current.close();
    else closeTimer.current = setTimeout(() => dialog.current?.close(), 220);
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = new URL(href, window.location.href);
    if (target.origin === location.origin && target.pathname === location.pathname && target.hash) {
      event.preventDefault();
      closeMenu(() => {
        window.location.hash = target.hash;
        document.getElementById(decodeURIComponent(target.hash.slice(1)))?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    } else closeMenu();
  }

  async function signOut() {
    closeMenu();
    await createBrowserSupabase().auth.signOut();
    setMe(null);
    router.push('/card');
    router.refresh();
  }

  const signedIn = me ? true : me === null ? false : Boolean(loggedIn);
  const navigation = links.length ? [...links] : [
    { href: '/card', label: 'URBANLINKS 首頁' },
    { href: '/card/business', label: '品牌官網' },
    { href: '/card/pricing', label: '方案價格' },
  ];
  if (!navigation.some(link => link.href === '/card/cases')) navigation.splice(Math.max(1, navigation.length - 1), 0, { href: '/card/cases', label: '客戶案例' });

  return (
    <div className={variant === 'floating' ? styles.floating : styles.wrapper} style={variant === 'floating' ? { top } : undefined}>
      <button ref={trigger} className={styles.trigger} type="button" aria-label="開啟選單" aria-expanded={open} aria-controls={id} aria-haspopup="dialog"
        onClick={() => { setClosing(false); setOpen(true); dialog.current?.showModal(); }}><Menu size={22} /></button>
      <dialog ref={dialog} id={id} className={styles.drawer} aria-labelledby={`${id}-title`} data-closing={closing}
        onCancel={event => { event.preventDefault(); closeMenu(); }}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const items = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(item => item.getClientRects().length > 0);
          if (!items.length) return;
          event.preventDefault();
          const index = items.indexOf(document.activeElement as HTMLElement);
          const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
          items[next].focus();
        }}
        onClose={() => {
          setOpen(false);
          setClosing(false);
          trigger.current?.focus({ preventScroll: true });
          const callback = afterClose.current;
          afterClose.current = null;
          if (callback) requestAnimationFrame(() => requestAnimationFrame(callback));
        }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeMenu();
        }}>
        <header className={styles.heading}>
          {/* 選單上方:登入者的帳號資訊(LINE 登入的合成 email 不顯示) */}
          {signedIn ? (
            <div className={styles.who}>
              <span className={styles.whoText}>
                <strong>{me?.name || '會員'}</strong>
                <small>{!me ? '讀取中…' : me.email.endsWith('@line.urbanite.com.tw') ? '以 LINE 帳號登入' : me.email}</small>
              </span>
            </div>
          ) : (
            <div className={styles.who}>
              <span className={styles.whoText}><strong>尚未登入</strong><small>登入後可管理名片與預約</small></span>
            </div>
          )}
          <button autoFocus type="button" aria-label="關閉選單" onClick={() => closeMenu()}><X size={22} /></button>
        </header>
        <div className={styles.content}>
          {appNav ? <div className={styles.navigation}>
            <h2 id={`${id}-title`} className={styles.srOnly}>{appNav.title}選單</h2>
            <nav aria-label={appNav.title}>{appNav.items.map(item => <Link key={item.href} href={item.href} onClick={event => navigate(event, item.href)} className={styles.appLink} aria-current={item.active ? 'page' : undefined}>
              <span>{item.label}</span><ChevronRight size={16} />
            </Link>)}</nav>
            <div className={styles.account}>
              <Link href="/card" onClick={event => navigate(event, '/card')}><House />首頁<ChevronRight /></Link>
              <Link href="/mycard" onClick={event => navigate(event, '/mycard')}><UserRound />我的名片<ChevronRight /></Link>
              <Link href="/card/pricing" onClick={event => navigate(event, '/card/pricing')}><CreditCard />升級官網<ChevronRight /></Link>
            </div>
          </div> : <div className={styles.navigation}>
            <h2 id={`${id}-title`} className={styles.srOnly}>主要選單</h2>
            <nav aria-label="主要導覽">{navigation.map((link, index) => <Link key={link.href + link.label} href={link.href} onClick={event => navigate(event, link.href)} className={styles.navLink} aria-current={link.href === '/card/pricing' && current === 'upgrade' ? 'page' : undefined}>
              <small>{String(index + 1).padStart(2, '0')}</small><span>{link.label}{link.href === '/card/cases' && <small>服飾・租屋・美業・LINE AI</small>}</span><ArrowRight size={19} />
            </Link>)}</nav>
            {signedIn && <div className={styles.account}>
              {me?.isAdmin && <a href="/admin" onClick={event => navigate(event, '/admin')}><LayoutDashboard />管理後台<ChevronRight /></a>}
              {(me?.shops ?? []).filter(shop => !shop.current).map(shop => <a key={shop.slug} href={shop.adminUrl} onClick={event => navigate(event, shop.adminUrl)}><Store /><span>我的官網後台<small>{shop.name || shop.slug}</small></span><ChevronRight /></a>)}
              <Link href="/mycard" aria-current={current === 'mycard' ? 'page' : undefined} onClick={event => navigate(event, '/mycard')}><UserRound />我的名片<ChevronRight /></Link>
              <Link href="/mycard/booking" aria-current={current === 'booking' ? 'page' : undefined} onClick={event => navigate(event, '/mycard/booking')}><CalendarCheck />線上預約管理<ChevronRight /></Link>
              {!navigation.some(link => link.href === '/card/pricing') && <Link href="/card/pricing" aria-current={current === 'upgrade' ? 'page' : undefined} onClick={event => navigate(event, '/card/pricing')}><CreditCard />方案價格<ChevronRight /></Link>}
              {!navigation.some(link => link.href === '/card') && <Link href="/card" onClick={event => navigate(event, '/card')}><House />URBANLINKS 首頁<ChevronRight /></Link>}
            </div>}
          </div>}
        </div>
        <footer className={styles.footer}>{signedIn ? <button type="button" onClick={signOut}><LogOut size={17} />登出</button> : <><Link href="/card/login" onClick={event => navigate(event, '/card/login')}>登入</Link><Link href="/card/register" onClick={event => navigate(event, '/card/register')}>免費開始<ArrowRight size={17} /></Link></>}</footer>
      </dialog>
    </div>
  );
}
