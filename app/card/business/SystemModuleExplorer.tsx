'use client';

import { useState } from 'react';
import styles from './system.module.css';

const modules = [
  {
    key: 'commerce',
    number: '01',
    label: '商品與交易',
    eyebrow: 'COMMERCE CORE',
    title: '從規格庫存，到順利完成結帳。',
    description: '同一個商品可以擁有顏色、尺寸與自訂規格，每個組合獨立控管庫存、價格與圖片，並直接銜接購物車與結帳。',
    features: ['多規格商品', '預購與加購', '購物車檢核', '優惠與運費'],
    metric: ['128', '在售規格'],
    rows: [['經典大學 T', '深藍 / XL', '庫存 18'], ['連帽外套', '米白 / M', '庫存 7'], ['輕質短袖 T', '霧紫 / L', '預購']],
  },
  {
    key: 'operations',
    number: '02',
    label: '訂單與物流',
    eyebrow: 'ORDER OPERATIONS',
    title: '每張訂單，都知道下一步該做什麼。',
    description: '付款、備貨、出貨、配送與完成狀態分開管理，搭配超商寄件代碼、物流貨態與完整歷程，降低人工判斷成本。',
    features: ['狀態工作流', '超商取貨', '出貨單建立', '退貨與退款'],
    metric: ['8', '筆待出貨'],
    rows: [['UR202610050018', '全家取貨付款', '待建立出貨單'], ['UR202610050014', '7-ELEVEN 純取貨', '寄件代碼 881209'], ['UR202610040011', '宅配到府', '配送中']],
  },
  {
    key: 'customers',
    number: '03',
    label: '會員與行銷',
    eyebrow: 'CUSTOMER GROWTH',
    title: '把一次成交，累積成長期會員關係。',
    description: '會員資料、收藏、地址、優惠券與購買紀錄互相連結，讓商家能發放精準優惠，也讓顧客持續保有自己的服務紀錄。',
    features: ['Google／LINE 登入', '商品收藏', '會員優惠券', '購物金'],
    metric: ['46', '本月新會員'],
    rows: [['新會員首購', 'WELCOME10', '啟用中'], ['滿額折抵', 'MOOM100', '已領取 38'], ['全站免運', 'FREESHIP', '剩餘 62']],
  },
  {
    key: 'campaign',
    number: '04',
    label: '活動與內容',
    eyebrow: 'CAMPAIGN ENGINE',
    title: '同一套後台，快速推出獨立活動頁。',
    description: '活動頁有獨立網址、商品、分類與搜尋，不混入主站內容；適合廣告投放、限時企劃與團購，並共用既有結帳能力。',
    features: ['獨立活動網址', '專屬商品搜尋', '活動庫存', '共用結帳'],
    metric: ['3', '個進行中活動'],
    rows: [['秋季限定企劃', '/promo/autumn', '公開中'], ['會員週末限定', '/promo/vip-weekend', '排程'], ['新品預購會', '/promo/preorder', '草稿']],
  },
] as const;

export default function SystemModuleExplorer() {
  const [activeKey, setActiveKey] = useState<(typeof modules)[number]['key']>('commerce');
  const active = modules.find((module) => module.key === activeKey) ?? modules[0];

  return (
    <div className={styles.moduleExplorer} data-reveal>
      <div className={styles.moduleRail} role="tablist" aria-label="系統模組">
        {modules.map((module) => (
          <button
            type="button"
            role="tab"
            aria-selected={active.key === module.key}
            aria-controls="system-module-panel"
            key={module.key}
            onClick={() => setActiveKey(module.key)}
          >
            <span>{module.number}</span><b>{module.label}</b><i aria-hidden>↗</i>
          </button>
        ))}
      </div>
      <div className={styles.modulePanel} id="system-module-panel" role="tabpanel" key={active.key}>
        <div className={styles.modulePanelCopy}>
          <small>{active.eyebrow}</small>
          <h3>{active.title}</h3>
          <p>{active.description}</p>
          <div className={styles.moduleTags}>{active.features.map((feature) => <span key={feature}>{feature}</span>)}</div>
        </div>
        <div className={styles.moduleInterface}>
          <div className={styles.moduleInterfaceTop}>
            <span>即時摘要</span><i>LIVE</i>
          </div>
          <div className={styles.moduleMetric}><strong>{active.metric[0]}</strong><span>{active.metric[1]}</span></div>
          <div className={styles.moduleRows}>
            {active.rows.map((row, index) => (
              <div key={row[0]}><span>{String(index + 1).padStart(2, '0')}</span><b>{row[0]}</b><small>{row[1]}</small><em>{row[2]}</em></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
