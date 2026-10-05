import type { Metadata } from 'next';
import Link from 'next/link';
import SystemEffects from './SystemEffects';
import SystemModuleExplorer from './SystemModuleExplorer';
import { CONTACT_LINE_URL, SERVICE_LOGO } from '@/lib/card-plan';
import styles from './system.module.css';

// URBANLINKS 品牌官網(U Pro / U Max)介紹頁
export const metadata: Metadata = {
  title: { absolute: '品牌官網 U Pro・U Max | URBANLINKS' },
  description: '整合品牌官網、商品、會員、訂單、金流、物流、庫存與促銷的一站式電商網站系統。',
};

const storefrontFeatures = [
  ['品牌首頁', '輪播、分類導覽、精選商品與品牌內容皆可由後台管理。'],
  ['多規格商品', '顏色、尺寸、自訂選項、規格圖片與獨立庫存完整整合。'],
  ['會員經營', '會員資料、收藏、優惠券、購物金與訂單紀錄集中管理。'],
  ['完整結帳', '優惠計算、配送選擇、超商門市與多元付款一次完成。'],
];

const adminFeatures = [
  ['營運總覽', '營收、訂單、低庫存與近期交易集中在同一個工作台。'],
  ['訂單與物流', '從付款確認、建立出貨單到物流貨態，保留完整處理紀錄。'],
  ['商品與庫存', '管理上下架、售價、成本、安全庫存及所有規格數量。'],
  ['促銷與售後', '優惠券、活動頁、取消、退貨及退款流程皆有對應介面。'],
];

export default function SystemIntroductionPage() {
  return (
    <main className={styles.page} data-system-page>
      <SystemEffects />
      <span className={styles.scrollProgress} aria-hidden />
      <header className={styles.header}>
        <Link href="/card" className={styles.brand} aria-label="回 URBANLINKS 首頁">
          <img src={SERVICE_LOGO} alt="URBANLINKS" style={{ height: 16, width: 'auto' }} />
          <span><small>品牌官網・U PRO / U MAX</small></span>
        </Link>
        <nav className={styles.nav} aria-label="頁面導覽">
          <a href="#experience" data-section-link>前台體驗</a>
          <a href="#operations" data-section-link>營運後台</a>
          <a href="#modules" data-section-link>功能模組</a>
          <a href="#delivery" data-section-link>導入方式</a>
        </nav>
        <a className={styles.headerCta} href="#contact"><span className={styles.headerCtaLabel}>預約系統展示</span><span aria-hidden>→</span></a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy} data-reveal data-visible="true">
          <p className={styles.eyebrow}>BRAND COMMERCE, BUILT AS ONE</p>
          <h1>品牌電商<br />網站系統</h1>
          <p className={styles.heroLead}>
            一套整合前台購物體驗與後台營運流程的電商模組。商品、會員、訂單、金流、物流與促銷共用同一份資料，從第一筆訂單開始就能真正營運。
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#modules">查看完整功能 <span aria-hidden>↓</span></a>
            <a className={styles.textLink} href="#contact">取得導入評估 <span aria-hidden>↗</span></a>
          </div>
          <div className={styles.heroFacts} aria-label="系統摘要">
            <span><b>前台＋後台</b> 完整整合</span>
            <span><b>手機優先</b> 響應式介面</span>
            <span><b>模組架構</b> 持續擴充</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="電商營運後台預覽" data-tilt data-reveal data-visible="true">
          <span className={styles.visualSheen} aria-hidden />
          <div className={styles.browserBar}>
            <span className={styles.browserDots}><i /><i /><i /></span>
            <span className={styles.browserAddress}>commerce.yourbrand.com/admin</span>
            <span className={styles.browserSecure}>SECURE</span>
          </div>
          <div className={styles.dashboard}>
            <aside className={styles.dashboardNav}>
              <strong>URBANITE</strong>
              {['總覽', '訂單管理', '商品及分類', '庫存管理', '顧客管理', '促銷管理'].map((item, index) => (
                <span className={index === 0 ? styles.dashboardNavActive : ''} key={item}><i />{item}</span>
              ))}
            </aside>
            <div className={styles.dashboardMain}>
              <div className={styles.dashboardHeading}>
                <div><small>STORE OVERVIEW</small><h2>營運總覽</h2></div>
                <span>2026.10.05</span>
              </div>
              <div className={styles.revenuePanel}>
                <div><small>總營收</small><strong>NT$ 128,640</strong></div>
                <div className={styles.revenueSplit}><span>今日營收<b>NT$ 8,941</b></span><span>總訂單<b>328</b></span></div>
              </div>
              <div className={styles.metricRow}>
                <div><span>待出貨訂單</span><b>8</b><small>前往處理 →</small></div>
                <div><span>低庫存商品</span><b>12</b><small>庫存 ≤ 10</small></div>
                <div><span>本月新會員</span><b>46</b><small>較上月 +18%</small></div>
              </div>
              <div className={styles.orderPreview}>
                <div className={styles.orderHeader}><b>最近訂單</b><span>查看全部 →</span></div>
                {[
                  ['UR202610050018', '待出貨', 'NT$ 2,480'],
                  ['UR202610050017', '尚未付款', 'NT$ 1,260'],
                  ['UR202610040016', '已完成', 'NT$ 3,980'],
                ].map((order) => <div className={styles.orderRow} key={order[0]}><b>{order[0]}</b><span>{order[1]}</span><strong>{order[2]}</strong></div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.proofBar} aria-label="核心價值" data-reveal>
        <span><b>01</b> 自有品牌與網域</span>
        <span><b>02</b> 前後台資料同步</span>
        <span><b>03</b> 金流物流可串接</span>
        <span><b>04</b> 可持續客製擴充</span>
      </section>

      <section className={styles.introBand} data-reveal>
        <p className={styles.sectionIndex}>01 / SYSTEM VALUE</p>
        <div className={styles.introGrid}>
          <h2>不是只有漂亮的模板，<br />而是完整的營運工具。</h2>
          <div>
            <p>消費者看到的是流暢、具有品牌感的購物網站；經營者使用的是可以接單、出貨、控管庫存與經營會員的營運後台。</p>
            <p>所有模組彼此相連，避免資料散落在不同工具，也減少人工重複整理。</p>
          </div>
        </div>
      </section>

      <section className={styles.experience} id="experience">
        <div className={styles.sectionHeading} data-reveal>
          <div><p className={styles.sectionIndex}>02 / STOREFRONT</p><h2>讓品牌被看見，<br />也讓購買自然完成。</h2></div>
          <p>前台不是套版賣場，而是能依品牌視覺調整的購物體驗。從首頁探索到會員售後，每個流程都針對手機操作設計。</p>
        </div>
        <div className={styles.featureLayout} data-reveal>
          <div className={styles.phoneVisual}>
            <div className={styles.phoneTop}><span>9:41</span><i /><i /><i /></div>
            <div className={styles.storeHeader}><span>☰</span><b>urbanite<small>CUSTOM WEAR</small></b><span>♡　⌑</span></div>
            <div className={styles.storeBanner}><small>NEW SEASON</small><strong>Essential<br />Collection</strong><span>VIEW EDIT →</span></div>
            <div className={styles.storeTabs}><span>全部商品</span><span className={styles.storeTabActive}>精選商品</span><span>外套</span></div>
            <div className={styles.productGrid}>
              <div><span className={styles.shirtShape} /><b>經典大學 T</b><small>NT$ 690</small></div>
              <div><span className={`${styles.shirtShape} ${styles.shirtLight}`} /><b>連帽外套</b><small>NT$ 890</small></div>
            </div>
          </div>
          <div className={styles.featureList}>
            {storefrontFeatures.map(([title, text], index) => (
              <article key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.operations} id="operations">
        <div className={styles.sectionHeading} data-reveal>
          <div><p className={styles.sectionIndex}>03 / OPERATIONS</p><h2>每一筆訂單，<br />都有清楚的下一步。</h2></div>
          <p>把日常營運需要查看和操作的資訊放在同一套後台，狀態清楚、操作集中，也保留必要的處理紀錄。</p>
        </div>
        <div className={styles.operationsBoard} data-reveal>
          <div className={styles.operationsTabs}><b>訂單管理</b><span>全部 328</span><span>尚未付款 7</span><span className={styles.operationsTabActive}>待出貨 8</span><span>已處理 12</span></div>
          <div className={styles.operationsOrders}>
            <div><span className={styles.statusDot} /><b>UR202610050018</b><small>全家取貨付款 · 台北信義店</small><strong>NT$ 2,480</strong><button type="button">建立出貨單</button></div>
            <div><span className={styles.statusDot} /><b>UR202610050014</b><small>7-ELEVEN 純取貨 · 富陽門市</small><strong>NT$ 1,380</strong><button type="button">查看訂單</button></div>
          </div>
        </div>
        <div className={styles.adminFeatureGrid} data-reveal>
          {adminFeatures.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p><span aria-hidden>↗</span></article>)}
        </div>
      </section>

      <section className={styles.modules} id="modules">
        <div className={styles.sectionHeading} data-reveal>
          <div><p className={styles.sectionIndex}>04 / MODULES</p><h2>一套系統，涵蓋<br />品牌電商的核心工作。</h2></div>
          <p>先以完整基礎模組上線，再依品牌流程加入發票、通知、會員分級或其他第三方服務。</p>
        </div>
        <SystemModuleExplorer />
      </section>

      <section className={styles.campaignBand} data-reveal>
        <div>
          <p className={styles.sectionIndex}>BUILT-IN CAMPAIGN PAGES</p>
          <h2>廣告活動不必再另外架站。</h2>
          <p>直接從後台建立獨立一頁式促銷網站。每個活動有自己的網址、商品、分類與搜尋，不會混入主站商品，適合限時活動、團購與廣告投放。</p>
        </div>
        <div className={styles.campaignFlow}>
          <span><b>建立活動</b><small>名稱與專屬網址</small></span><i>→</i>
          <span><b>加入商品</b><small>獨立價格與庫存</small></span><i>→</i>
          <span><b>開始投放</b><small>活動頁直接成交</small></span>
        </div>
      </section>

      <section className={styles.delivery} id="delivery">
        <div className={styles.sectionHeading} data-reveal>
          <div><p className={styles.sectionIndex}>05 / DELIVERY</p><h2>從品牌資料到正式上線，<br />每一步都看得見。</h2></div>
          <p>導入內容依實際品牌需求確認，保留清楚的範圍與驗收標準，避免上線後才發現流程不符合使用情境。</p>
        </div>
        <ol className={styles.steps} data-reveal>
          <li><span>01</span><div><h3>需求盤點</h3><p>確認品牌、商品、付款、物流與營運流程。</p></div></li>
          <li><span>02</span><div><h3>視覺設定</h3><p>套用 Logo、品牌色、首頁內容與網站資訊。</p></div></li>
          <li><span>03</span><div><h3>系統串接</h3><p>設定網域、資料庫、金流、物流與會員登入。</p></div></li>
          <li><span>04</span><div><h3>測試上線</h3><p>完成手機、訂單、付款、出貨及權限驗收。</p></div></li>
        </ol>
      </section>

      <section className={styles.contact} id="contact" data-reveal>
        <p className={styles.sectionIndex}>START YOUR COMMERCE</p>
        <h2>把品牌官網，變成真正能營運的系統。</h2>
        <p>預約系統展示，我們會依商品數量、付款物流方式與需要的客製功能提供導入建議。</p>
        <div className={styles.contactActions}>
          <a className={styles.contactPrimary} href={CONTACT_LINE_URL} target="_blank" rel="noreferrer">聯繫專員預約展示 <span aria-hidden>↗</span></a>
          <Link className={styles.contactSecondary} href="/card#pricing">查看方案價格</Link>
          <Link className={styles.contactSecondary} href="/">查看目前示範商店</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>URBANLINKS 品牌官網</span>
        <span>品牌電商網站・營運後台・促銷工具</span>
        <span>© 2026 URBANLINKS</span>
      </footer>
    </main>
  );
}
