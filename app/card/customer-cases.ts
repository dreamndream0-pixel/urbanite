export type CaseCategory = 'fashion' | 'rental' | 'beauty' | 'line';
export type CustomerCase = {
  id: string;
  name: string;
  category: CaseCategory;
  categoryLabel: string;
  kind: 'live' | 'demo' | 'pending';
  image: string;
  description: string;
  tags: string[];
  url?: string;
};

export const caseCategories: { key: 'all' | CaseCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'fashion', label: '服飾電商' },
  { key: 'rental', label: '租屋與代管' },
  { key: 'beauty', label: '美業預約' },
  { key: 'line', label: 'LINE AI' },
];

export const customerCases: CustomerCase[] = [
  { id: 'urbanite', name: 'URBANITE', category: 'fashion', categoryLabel: '服飾品牌官網', kind: 'live', image: '/card/cases/urbanite-live.webp', description: '從素 T 到日常穿搭，將品牌商品、分類與購物流程放在同一個網站。', tags: ['品牌官網', '購物商店'], url: 'https://www.urbanite.com.tw/' },
  { id: 'chue', name: 'CHUÉ', category: 'fashion', categoryLabel: '服飾・二手選品', kind: 'live', image: '/card/cases/chue.webp', description: '以專屬活動頁呈現二手服飾，保留品牌風格與清楚的商品分類。', tags: ['服飾選品', '活動頁'], url: 'https://chue.urbanite.com.tw/promo/second-hand' },
  { id: 'snail-rental', name: '小蝸出租', category: 'rental', categoryLabel: '全方位租屋網', kind: 'live', image: '/card/cases/snail-rental.webp', description: '透過地區、租金與房型搜尋房源，連結物件資訊與房東的公開頁面。', tags: ['房源搜尋', '租屋平台'], url: 'https://xiaowo-rental.vercel.app/' },
  { id: 'rental-management', name: '包租代管模組', category: 'rental', categoryLabel: '租屋營運後台', kind: 'pending', image: '/card/cases/snail-rental.webp', description: '後台截圖待補。目前封面為租屋網公開頁面，非代管後台畫面。', tags: ['展示位置已保留', '後台截圖待補'] },
  { id: 'mori-nail', name: 'MORI NAIL', category: 'beauty', categoryLabel: '美甲・美睫工作室', kind: 'demo', image: '/card/cases/mori-nail-demo.webp', description: '簡單整理服務項目與作品，為個人工作室保留清楚的預約入口。', tags: ['美甲', '美睫', '預約入口'] },
  { id: 'day-hair', name: 'DAY HAIR', category: 'beauty', categoryLabel: '美髮・造型沙龍', kind: 'demo', image: '/card/cases/day-hair-demo.webp', description: '以真實店面感呈現剪髮、染髮與護理服務，不需要華麗的裝飾。', tags: ['美髮', '服務項目', '作品展示'] },
  { id: 'slow-skin', name: 'SLOW SKIN', category: 'beauty', categoryLabel: '美容護膚・身體舒緩', kind: 'demo', image: '/card/cases/slow-skin-demo.webp', description: '以安靜、清楚的版面呈現護膚與身體舒緩工作室的日常。', tags: ['美容護膚', '按摩舒緩', '諮詢'] },
  { id: 'line-ai', name: 'LINE AI 系統整合', category: 'line', categoryLabel: '智能客服・預約整合', kind: 'demo', image: '/card/cases/line-ai-demo.webp', description: '以對話串接詢問、時段選擇與訂單狀態。此為流程示意，非真實客戶對話。', tags: ['客服回覆', '預約流程', '訂單通知'] },
  { id: 'line-ai-orders', name: 'LINE AI 訂單客服', category: 'line', categoryLabel: '電商客服・訂單查詢', kind: 'demo', image: '/card/cases/line-ai-orders-demo.webp', description: '從訂單進度詢問到轉接專員，呈現電商客服的日常流程。畫面資料皆為示意。', tags: ['訂單查詢', '物流進度', '轉接專員'] },
];
