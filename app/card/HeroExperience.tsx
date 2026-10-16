'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, CalendarDays, ChartNoAxesColumnIncreasing, Check, ChevronDown, ChevronRight, Layers, Link2, Mail, Menu, Monitor, Search, ShoppingBag, Users, X } from 'lucide-react';
import SocialIcon from '@/app/components/SocialIcon';
import SocialBrandIcon, { type SocialBrand } from '@/app/components/SocialBrandIcon';
import { useScrollLock } from '@/app/components/useScrollLock';
import { getScrollY, onPageScroll } from '@/lib/page-scroll';
import HeroImportBubble from './HeroImportBubble';
import styles from './hero-experience.module.css';

const features = [
  { key: 'store', label: '品牌官網', Icon: Monitor },
  { key: 'booking', label: '預約系統', Icon: CalendarDays },
  { key: 'social', label: '社群整合', Icon: Users },
] as const;
type Feature = typeof features[number]['key'];
const times = ['10:00', '11:00', '14:00'];
const headlineWords = ['質感網店', '品牌官網', '個人名片', '預約服務'];
const socials: { key: SocialBrand; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'line', label: 'LINE' },
  { key: 'facebook', label: 'Facebook' },
];

export default function HeroExperience({ startHref, loggedIn }: { startHref: string; loggedIn: boolean }) {
  const [feature, setFeature] = useState<Feature>('store');
  const [slot, setSlot] = useState('11:00');
  const [confirmed, setConfirmed] = useState(false);
  const [social, setSocial] = useState<SocialBrand>('instagram');
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  const [importOpen, setImportOpen] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const importTrigger = useRef<HTMLButtonElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduced = useRef(false);

  useScrollLock(importOpen);

  useEffect(() => {
    const element = hero.current;
    if (!element) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { reduced.current = media.matches; };
    updateMotion();
    media.addEventListener('change', updateMotion);
    const updatePageVisibility = () => { element.dataset.pageHidden = String(document.hidden); };
    updatePageVisibility();
    document.addEventListener('visibilitychange', updatePageVisibility);
    // Follow the shared body-scroll path used by iPhone Chrome, without changing layout on scroll.
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        element.style.setProperty('--scroll-lift', `${reduced.current ? 0 : Math.min(getScrollY() * 0.035, 18)}px`);
      });
    };
    const offScroll = onPageScroll(update);
    const measure = () => {
      const top = element.getBoundingClientRect().top + getScrollY();
      element.style.setProperty('--above-hero', `${Math.max(0, top)}px`);
    };
    const observer = new ResizeObserver(measure);
    if (element.previousElementSibling) observer.observe(element.previousElementSibling);
    if (element.parentElement?.previousElementSibling) observer.observe(element.parentElement.previousElementSibling);
    measure();
    window.addEventListener('resize', measure);
    const visibility = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== element) {
          element.dataset.headlineVisible = String(entry.isIntersecting);
          continue;
        }
        element.dataset.visible = String(entry.isIntersecting);
        if (!entry.isIntersecting) element.dataset.interacting = 'false';
      }
    });
    visibility.observe(element);
    const heading = element.querySelector('h1');
    if (heading) visibility.observe(heading);
    return () => {
      offScroll();
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      window.removeEventListener('resize', measure);
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updatePageVisibility);
    };
  }, []);

  function selectSlot(time: string) {
    setSlot(time);
    setConfirmed(false);
    setFeature('booking');
  }

  function selectSocial(key: SocialBrand) {
    setSocial(key);
    setFeature('social');
  }

  function switchTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % features.length
      : event.key === 'ArrowLeft' ? (index + features.length - 1) % features.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? features.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setFeature(features[next].key);
    tabs.current[next]?.focus();
  }

  function closeImport() {
    dialog.current?.close();
    setImportOpen(false);
  }

  return (
    <section ref={hero} className={styles.hero} aria-labelledby="urbanlinks-hero-title" data-visible="true"
      onPointerDownCapture={() => { if (hero.current) hero.current.dataset.interacting = 'true'; }}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && hero.current) hero.current.dataset.interacting = 'false'; }}>
      <Image className={styles.background} src="/card/hero-commerce-studio.webp" alt="" fill priority sizes="100vw" />
      <div className={styles.eyebrow} aria-hidden="true">
        <span>BUILD YOUR STORE<br />IN 3 MINUTES</span><i /><span>FOR MODERN BRANDS</span>
      </div>
      <div className={styles.copy}>
        <h1 id="urbanlinks-hero-title" className={styles.headline} aria-label="3分鐘就開店，打造質感網店">
          <span className={styles.headlineIntro} aria-hidden="true">
            <b className={styles.headlineNumber}>3</b>
            {Array.from('分鐘就開店').map((letter, index) => <span className={styles.headlineLetter} style={{ animationDelay: `${200 + index * 70}ms` }} key={index}>{letter}</span>)}
          </span>
          <span className={styles.headlineSecond} aria-hidden="true">
            打造<span className={styles.headlineWindow}><span className={styles.headlineTrack}>
              {[...headlineWords, headlineWords[0]].map((word, index) => <span className={styles.headlineWord} key={index}>{word}</span>)}
            </span></span>
          </span>
        </h1>
        <Link className={styles.integration} href={startHref}><Link2 />線上線下整合<ArrowRight /></Link>
        <p>專為品牌解放雙手</p>
      </div>

      <div className={styles.stage} data-feature={feature}>
        <div className={styles.phoneGroup} id="hero-preview-panel" role="tabpanel" aria-labelledby={`hero-tab-${feature}`}>
          <div className={`${styles.phone} ${styles.profilePhone}`}>
            <span className={styles.notch} aria-hidden="true" />
            <div className={styles.profileScreen}>
              {feature === 'booking' ? (
                <div className={styles.bookingScreen} key="booking">
                  <CalendarDays /><small>BEAUTY STUDIO</small><h2>預約美好日常</h2>
                  <span>臉部保養 · 60 分鐘</span>
                  <Image src="/card/pricing-studio.webp" alt="保養工作室示意" width={180} height={130} className={styles.bookingPhoto} />
                  <p>選擇預約時段</p>
                  <div className={styles.phoneTimes}>{times.map(time => <button key={time} type="button" aria-pressed={slot === time} onClick={() => selectSlot(time)}>{time}</button>)}</div>
                  <button className={styles.confirm} type="button" onClick={() => setConfirmed(true)}>{confirmed ? <><Check />已確認 {slot}</> : <>示範預約<ArrowRight /></>}</button>
                  <small className={styles.demoNote}>互動示範，不會建立真實預約</small>
                </div>
              ) : (
                <div className={styles.profileContent} key="profile">
                  <Image className={styles.avatar} src="/card/demo-creator.webp" alt="Brenda 個人頁示意" width={90} height={90} />
                  <h2>Brenda</h2><p>Creator / Lifestyle / Retail</p>
                  <div className={styles.profileLinks}>
                    {socials.filter(item => item.key === 'line' || item.key === (social === 'facebook' ? 'facebook' : 'instagram')).map(item => <button key={item.key} type="button" aria-pressed={feature === 'social' && social === item.key} onClick={() => selectSocial(item.key)}><SocialIcon type={item.key} size={14} />{item.label}<ChevronRight /></button>)}
                    <Link href="/card/business"><ShoppingBag />Shop<ChevronRight /></Link>
                    <Link href="#spaces"><Layers />Portfolio<ChevronRight /></Link>
                    <Link href={startHref}><Mail />Contact<ChevronRight /></Link>
                  </div>
                  <span className={styles.profileFooter}>{feature === 'social' ? `${socials.find(item => item.key === social)?.label} 已整合` : 'YOUR WORLD. ONE LINK.'}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`${styles.phone} ${styles.storePhone}`}>
            <span className={styles.notch} aria-hidden="true" />
            <div className={styles.storeScreen}>
              <div className={styles.storeNav}><strong>URBANLINKS</strong><Search /><ShoppingBag /><Menu /></div>
              <div className={styles.storePhoto}>
                <Image src="/card/demo-fashion.webp" alt="美感品牌官網展示" fill sizes="(max-width: 600px) 180px, 250px" priority />
                <div className={styles.storeCopy}><span>Beauty<br />Lives Brighter</span><p>讓美好，成為日常</p><Link href="/card/business">SHOP NOW <ArrowRight /></Link></div>
              </div>
              <div className={styles.categories}>{[
                { image: '/card/templates/shop/vera-glow.jpg', label: '保養' },
                { image: '/card/demo-collection.webp', label: '香氛' },
                { image: '/card/demo-creator.webp', label: '理想的妳' },
                { image: '/card/pricing-studio.webp', label: '品牌故事' },
              ].map(item => <Link href="/card/business" key={item.label}><Image src={item.image} alt="" width={48} height={48} /><span>{item.label}</span></Link>)}</div>
            </div>
          </div>
        </div>

        <div className={`${styles.widget} ${styles.growth}`}>
          <span className={styles.widgetLabel}><ChartNoAxesColumnIncreasing />店鋪成長 <small>DEMO</small></span>
          <strong key={period}>+{period === 'month' ? '178' : '48'}%</strong>
          <div className={styles.periods} aria-label="示範瀏覽數期間">{(['month', 'week'] as const).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 'month' ? '本月' : '本週'}</button>)}<span>瀏覽人次</span></div>
          <svg className={styles.chart} viewBox="0 0 180 60" aria-hidden="true"><path d={period === 'month' ? 'M0 60 15 54 35 49 52 39 70 42 88 26 110 29 130 15 145 20 165 0 180 0V60Z' : 'M0 60 20 52 40 55 65 43 90 45 110 30 140 32 165 15 180 10V60Z'} fill="currentColor" /></svg>
        </div>

        <div className={`${styles.widget} ${styles.bookingWidget}`}>
          <span className={styles.widgetLabel}><CalendarDays />線上預約 <small>DEMO</small></span>
          <div className={styles.times} aria-label="示範預約時段">{times.map(time => <button key={time} type="button" aria-pressed={slot === time} onClick={() => selectSlot(time)}>{time}</button>)}</div>
        </div>

        <div className={`${styles.widget} ${styles.socialRail}`} aria-label="社群整合示範">
          {socials.map(item => <button key={item.key} type="button" onClick={() => selectSocial(item.key)} aria-label={`預覽 ${item.label} 整合`} aria-pressed={feature === 'social' && social === item.key} title={`預覽 ${item.label} 整合`}><SocialBrandIcon brand={item.key} /></button>)}
        </div>

        <button className={`${styles.widget} ${styles.notification}`} type="button" onClick={() => setFeature('booking')} title="查看預約示範">
          <Image src="/card/pricing-studio.webp" alt="" width={62} height={68} />
          <span aria-live="polite"><strong>{confirmed ? '預約已確認' : '新訂單'}<i /></strong><span>{confirmed ? `${slot} 臉部保養` : '療程預約'}</span><small>{confirmed ? '示範確認成功' : '3 分鐘前 · 示範'}</small></span>
        </button>
        <p className={styles.note} aria-hidden="true">All in one.<br />Just for you.</p>
      </div>

      <div className={styles.featureTabs} role="tablist" aria-label="探索 URBANLINKS">
        {features.map(({ key, label, Icon }, index) => <button ref={node => { tabs.current[index] = node; }} key={key} type="button" role="tab" id={`hero-tab-${key}`} aria-controls="hero-preview-panel" aria-selected={feature === key} tabIndex={feature === key ? 0 : -1} onKeyDown={event => switchTab(event, index)} onClick={() => setFeature(key)}><span><Icon /></span>{label}</button>)}
      </div>
      <div className={styles.bottom}>
        <button className={styles.importTrigger} ref={importTrigger} type="button" onClick={() => { setImportOpen(true); dialog.current?.showModal(); }}><Link2 />一鍵搬家</button>
        <button className={styles.scroll} type="button" aria-label="往下探索產品服務" onClick={() => document.getElementById('spaces')?.scrollIntoView({ behavior: reduced.current ? 'auto' : 'smooth', block: 'start' })}><ChevronDown /><span>SCROLL</span></button>
        <Link href={startHref} className={styles.begin}>免費開始<ArrowRight /></Link>
      </div>

      <dialog ref={dialog} className={styles.importDialog} aria-labelledby="hero-import-title" onClose={() => { setImportOpen(false); importTrigger.current?.focus({ preventScroll: true }); }} onClick={event => { if (event.target === event.currentTarget) closeImport(); }}>
        <div className={styles.dialogContent}>
          <div className={styles.dialogHeading}><h2 id="hero-import-title">把你的世界搬過來</h2><button autoFocus type="button" aria-label="關閉一鍵搬家" onClick={closeImport}><X /></button></div>
          <p>保留你的連結，換一個新的開始。</p>
          <HeroImportBubble loggedIn={loggedIn} className={styles.importForm} embedded onPreviewOpen={closeImport} />
        </div>
      </dialog>
      <span className={styles.srOnly} aria-live="polite">{feature === 'booking' ? `預約示範，已選擇 ${slot}${confirmed ? '，已確認' : ''}` : feature === 'social' ? `正在展示 ${socials.find(item => item.key === social)?.label} 社群整合` : '正在展示品牌官網'}</span>
    </section>
  );
}
