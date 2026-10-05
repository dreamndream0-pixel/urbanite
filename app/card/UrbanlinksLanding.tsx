'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, GripVertical, Menu, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import styles from './urbanlinks.module.css';

type DemoMode = 'link' | 'shop';

const productCards = [
  { key: 'link', index: '01', title: 'LINK', zh: '個人名片', copy: '把作品、社群與聯絡方式放進同一頁。', image: '/card/link-creator.webp', href: '#try' },
  { key: 'shop', index: '02', title: 'SHOP', zh: '購物商店', copy: '從商品展示到結帳，建立自己的品牌商店。', image: '/card/shop-editorial.webp', href: '#try' },
  { key: 'brand', index: '03', title: 'BRAND', zh: '品牌官網', copy: '不只一張頁面，打造真正屬於你的品牌網站。', image: '/showcase/arch-aurora.webp', href: '/card/business' },
] as const;

const plans = [
  { name: 'FREE', price: 'NT$0', cadence: '', line: 'Create your link.', features: ['8 款基本樣板', '最多 8 個區塊', '近 7 天數據'] },
  { name: 'PLUS', price: 'NT$39', cadence: '/ mo', line: 'Make it yours.', features: ['24 款完整樣板', '自訂版面風格', '30 天進階數據'] },
  { name: 'PRO', price: 'NT$399', cadence: '/ mo', line: 'Build your site.', features: ['商品上架與結帳', '專屬子網域', '串接自己的金流'] },
  { name: 'MAX', price: 'NT$699', cadence: '/ mo', line: 'Run your brand.', features: ['會員與購物金', '物流與 LINE Bot', '自訂品牌網域'] },
] as const;

const growthStages = ['LINK', 'SITE', 'SHOP', 'BRAND'] as const;

export default function UrbanlinksLanding({ startHref, loggedIn }: { startHref: string; loggedIn: boolean }) {
  const rootRef = useRef<HTMLElement>(null);
  const growthRef = useRef<HTMLElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoMode, setDemoMode] = useState<DemoMode>('link');
  const [links, setLinks] = useState(['Instagram', 'LINE', 'Portfolio', 'Shop', 'Contact']);
  const [background, setBackground] = useState<'navy' | 'ivory' | 'gold'>('navy');
  const [profile, setProfile] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(0);
  const [selectedSize, setSelectedSize] = useState('M');
  const [cartCount, setCartCount] = useState(0);
  const [cartSheet, setCartSheet] = useState(false);
  const [growthStage, setGrowthStage] = useState(0);
  const [activeCard, setActiveCard] = useState(0);
  const [stickyCta, setStickyCta] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.setAttribute('data-motion-ready', 'true');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (reduce) revealItems.forEach((item) => item.setAttribute('data-visible', 'true'));
    const observer = reduce ? null : new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute('data-visible', 'true');
        observer?.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: .12 });
    revealItems.forEach((item) => observer?.observe(item));

    let raf = 0;
    const update = () => {
      raf = 0;
      const heroProgress = Math.max(0, Math.min(1, window.scrollY / Math.max(1, window.innerHeight)));
      root.style.setProperty('--hero-scroll', heroProgress.toString());
      setStickyCta(window.scrollY > window.innerHeight * .8);
      const growth = growthRef.current;
      if (growth) {
        const rect = growth.getBoundingClientRect();
        const progress = Math.max(0, Math.min(.999, -rect.top / Math.max(1, rect.height - window.innerHeight)));
        setGrowthStage(Math.floor(progress * growthStages.length));
        growth.style.setProperty('--growth-progress', progress.toString());
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const moveLink = (index: number, delta: number) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= links.length) return;
    setLinks((current) => {
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const dropLink = (target: number) => {
    const source = dragIndex.current;
    dragIndex.current = null;
    if (source === null || source === target) return;
    setLinks((current) => {
      const copy = [...current];
      const [item] = copy.splice(source, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const addToCart = () => {
    setCartCount((count) => count + 1);
    setCartSheet(true);
  };

  return (
    <main ref={rootRef} className={styles.page} data-urbanlinks-page>
      <header className={styles.header}>
        <Link href="/card" className={styles.logoLink} aria-label="URBANLINKS 首頁">
          <Image src="/brand/urbanlinks-logo.png" alt="URBANLINKS" width={342} height={64} priority />
        </Link>
        <div className={styles.headerActions}>
          <Link href={startHref} className={styles.startLink}>{loggedIn ? '我的名片' : '開始建立'} <ArrowRight size={15} /></Link>
          <button type="button" className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="開啟選單"><Menu size={20} /></button>
        </div>
      </header>

      <div className={styles.fullMenu} data-open={menuOpen} aria-hidden={!menuOpen}>
        <button type="button" onClick={() => setMenuOpen(false)} aria-label="關閉選單"><X size={24} /></button>
        <nav>
          {[['01', 'LINK', '#products'], ['02', 'SHOP', '#products'], ['03', 'TRY IT', '#try'], ['04', 'PLANS', '#plans']].map(([number, label, href]) => (
            <a key={label} href={href} onClick={() => setMenuOpen(false)}><span>{number}</span>{label}<ArrowRight /></a>
          ))}
        </nav>
        <div><a href="#">Instagram</a><a href="#">LINE</a><a href="mailto:hello@urbanite.com.tw">Contact</a></div>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroWords} data-reveal data-visible="true">
          <p>URBANLINKS / YOUR DIGITAL SPACE</p>
          <h1>一個網址，<br />放進你的全部。</h1>
          <span>LINK · SHOP · BRAND</span>
        </div>
        <div className={styles.heroPhones} data-reveal data-visible="true">
          <PhoneFrame className={styles.linkPhone} label="個人名片">
            <div className={styles.autoScreen}>
              <Image src="/showcase/hero-sun.webp" alt="URBANLINKS 個人名片範例" fill sizes="220px" priority />
            </div>
          </PhoneFrame>
          <PhoneFrame className={styles.shopPhone} label="購物網站">
            <div className={styles.heroShopScreen}>
              <div><b>urbanite</b><ShoppingBag size={12} /></div>
              <Image src="/card/shop-editorial.webp" alt="品牌購物網站商品範例" fill sizes="220px" priority />
              <span>NEW ESSENTIALS</span>
            </div>
          </PhoneFrame>
        </div>
        <button type="button" className={styles.urlCapsule} onClick={() => document.querySelector('#try')?.scrollIntoView({ behavior: 'smooth' })}>
          urbanlinks.tw/yourname <ArrowRight size={16} />
        </button>
        <ArrowDown className={styles.heroArrow} size={18} aria-hidden />
      </section>

      <section className={styles.meaning} data-reveal>
        <div className={styles.meaningImage}><Image src="/card/link-creator.webp" alt="創作者整理個人作品" fill sizes="100vw" /></div>
        <p>WHAT IS URBANLINKS</p>
        <h2>URBANLINKS</h2>
        <div><span>不只是一個連結。</span><strong>是你的網路入口。</strong></div>
      </section>

      <section className={styles.products} id="products">
        <div className={styles.sectionIntro} data-reveal><p>CHOOSE YOUR SPACE</p><h2>先選一個開始。</h2><span>{String(activeCard + 1).padStart(2, '0')} / 03</span></div>
        <div className={styles.productRail} onScroll={(event) => {
          const el = event.currentTarget;
          const card = el.firstElementChild as HTMLElement | null;
          if (card) setActiveCard(Math.round(el.scrollLeft / (card.offsetWidth + 14)));
        }}>
          {productCards.map((card, index) => (
            <a href={card.href} className={styles.productStory} data-active={activeCard === index} key={card.key}>
              <Image src={card.image} alt={`${card.title} ${card.zh}`} fill sizes="(max-width: 760px) 86vw, 520px" />
              <span className={styles.storyIndex}>{card.index}</span>
              <div><small>{card.zh}</small><h3>{card.title}</h3><p>{card.copy}</p><b>Explore <ArrowRight size={17} /></b></div>
            </a>
          ))}
        </div>
      </section>

      <section className={styles.trySection} id="try">
        <div className={styles.sectionIntro} data-reveal><p>LIVE DEMO</p><h2>Try it.</h2><span>直接動手玩</span></div>
        <div className={styles.modeSwitch} role="tablist" data-reveal>
          <button type="button" role="tab" aria-selected={demoMode === 'link'} onClick={() => setDemoMode('link')}>LINK</button>
          <button type="button" role="tab" aria-selected={demoMode === 'shop'} onClick={() => setDemoMode('shop')}>SHOP</button>
        </div>

        {demoMode === 'link' ? (
          <div className={styles.builder} data-reveal>
            <div className={styles.builderControls}>
              <p>Drag it.</p>
              <span>拖曳排序，或使用箭頭調整連結。</span>
              <div className={styles.linkRows}>
                {links.map((link, index) => (
                  <div draggable onDragStart={() => { dragIndex.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropLink(index)} key={link}>
                    <GripVertical size={16} /><b>{link}</b>
                    <button type="button" onClick={() => moveLink(index, -1)} aria-label={`${link} 往上移`}>↑</button>
                    <button type="button" onClick={() => moveLink(index, 1)} aria-label={`${link} 往下移`}>↓</button>
                  </div>
                ))}
              </div>
              <div className={styles.styleControl}><span>BACKGROUND</span>{(['navy', 'ivory', 'gold'] as const).map((tone) => <button type="button" key={tone} data-tone={tone} aria-label={`切換 ${tone} 背景`} aria-pressed={background === tone} onClick={() => setBackground(tone)} />)}</div>
            </div>
            <InteractivePhone tone={background} profile={profile} links={links} onProfile={() => setProfile((value) => (value + 1) % 3)} />
          </div>
        ) : (
          <div className={styles.shopDemo} data-reveal>
            <div className={styles.shopBrowser}>
              <div className={styles.shopDemoHeader}><b>URBANITE</b><span>NEW　TOP　OUTER</span><button type="button" aria-label="購物車"><ShoppingBag size={18} /><i>{cartCount}</i></button></div>
              <div className={styles.shopGrid}>
                {[0, 1, 2].map((item) => (
                  <button type="button" key={item} onClick={() => setSelectedProduct(item)} aria-pressed={selectedProduct === item}>
                    <span><Image src="/card/shop-editorial.webp" alt="服飾商品" fill sizes="180px" /></span>
                    <b>{['NAVY OVERSHIRT', 'IVORY TEE', 'DAILY SET'][item]}</b><small>NT$ {['1,280', '680', '1,580'][item]}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.productDrawer}>
              <small>SELECTED ITEM</small><h3>{['Navy Overshirt', 'Ivory Tee', 'Daily Set'][selectedProduct]}</h3><strong>NT$ {['1,280', '680', '1,580'][selectedProduct]}</strong>
              <div className={styles.sizeRow}>{['S', 'M', 'L', 'XL'].map((size) => <button type="button" aria-pressed={selectedSize === size} onClick={() => setSelectedSize(size)} key={size}>{size}</button>)}</div>
              <button type="button" className={styles.addButton} onClick={addToCart}>加入購物車 <Plus size={17} /></button>
            </div>
          </div>
        )}
      </section>

      <section className={styles.growth} ref={growthRef}>
        <div className={styles.growthSticky}>
          <p>FROM LINK TO BRAND</p>
          <div className={styles.growthCircle}><span>{growthStages[growthStage]}</span></div>
          <h2>Start small.<br />Grow when you need.</h2>
          <small>先從一頁開始。需要時，再慢慢長大。</small>
          <div className={styles.growthSteps}>{growthStages.map((stage, index) => <span data-active={index <= growthStage} key={stage}>{stage}</span>)}</div>
        </div>
      </section>

      <section className={styles.plans} id="plans">
        <div className={styles.sectionIntro} data-reveal><p>PLANS</p><h2>Pick your way.</h2><span>左右滑動選擇</span></div>
        <div className={styles.planRail}>
          {plans.map((plan, index) => (
            <article className={styles.planCard} data-featured={index === 1} key={plan.name}>
              <span>{String(index + 1).padStart(2, '0')}</span><h3>{plan.name}</h3><p>{plan.line}</p><strong>{plan.price}<small>{plan.cadence}</small></strong>
              <ul>{plan.features.map((feature) => <li key={feature}><Plus size={13} />{feature}</li>)}</ul>
              <Link href={startHref}>{index === 0 ? '免費開始' : index === 1 ? '立即升級' : '聯繫專員'} <ArrowRight size={15} /></Link>
            </article>
          ))}
        </div>
        <Link href="/mycard/upgrade" className={styles.compareLink}>比較完整方案 <ArrowRight size={15} /></Link>
      </section>

      <section className={styles.finalCta} data-reveal>
        <Image src="/brand/u-logo.png" width={220} height={220} alt="U" />
        <p>YOUR SPACE. YOUR LINK.</p>
        <h2>你可以先有一個連結，<br />再慢慢把它變成自己的網站。</h2>
        <Link href={startHref}>建立你的 URBANLINKS <ArrowRight size={18} /></Link>
      </section>

      <footer className={styles.footer}><Image src="/brand/urbanlinks-logo.png" width={342} height={64} alt="URBANLINKS" /><span>LINK · SITE · SHOP · BRAND</span><small>© 2026 URBANLINKS</small></footer>

      <div className={styles.cartSheet} data-open={cartSheet} role="status" aria-live="polite">
        <button type="button" onClick={() => setCartSheet(false)} aria-label="關閉"><Minus size={17} /></button><span><ShoppingBag size={18} /><b>Added to cart.</b><small>{selectedSize} size · 購物車共 {cartCount} 件</small></span>
      </div>

      <Link href={startHref} className={styles.stickyCta} data-visible={stickyCta}>開始建立 <ArrowRight size={17} /></Link>
    </main>
  );
}

function PhoneFrame({ children, className, label }: { children: React.ReactNode; className: string; label: string }) {
  return <div className={`${styles.phoneFrame} ${className}`}><span>{label}</span><div>{children}</div></div>;
}

function InteractivePhone({ tone, profile, links, onProfile }: { tone: 'navy' | 'ivory' | 'gold'; profile: number; links: string[]; onProfile: () => void }) {
  const names = ['Mia Chen', 'Brenda Lin', 'Yuki Wu'];
  return (
    <div className={styles.demoPhone} data-tone={tone}>
      <div className={styles.demoPhoneNotch} />
      <button type="button" className={styles.demoAvatar} onClick={onProfile} aria-label="更換示範人物"><Image src="/card/link-creator.webp" alt="" fill sizes="82px" /></button>
      <h3>{names[profile]}</h3><p>Creative director · Taipei</p>
      <div>{links.map((link) => <button type="button" key={link}>{link}<ArrowRight size={13} /></button>)}</div>
    </div>
  );
}
