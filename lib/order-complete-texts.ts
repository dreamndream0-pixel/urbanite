// 訂單完成頁的文字(系統設定 → 結帳設定 → 訂單完成頁文字);空白 = 用預設文字
// 存在 site_settings.order_complete_texts
export type OrderCompleteTexts = {
  title: string; message: string; guestNote: string; paymentNote: string;
  lineTitle: string; lineText: string; lineButton: string; continueButton: string;
};

export const DEFAULT_ORDER_COMPLETE_TEXTS: OrderCompleteTexts = {
  title: '訂單成立！',
  message: '我們會盡快為你備貨，感謝購買。',
  guestNote: '訪客結帳，請截圖此訂單編號，以利後續追蹤訂單',
  paymentNote: '請完成付款後保留交易明細，方便我們對帳。',
  lineTitle: '訂閱 LINE 通知',
  lineText: '加入官方 LINE，查詢出貨進度及聯絡客服人員',
  lineButton: '訂閱 LINE 通知',
  continueButton: '繼續購物',
};

export const ORDER_COMPLETE_FIELDS: { key: keyof OrderCompleteTexts; label: string; long?: boolean; max: number }[] = [
  { key: 'title', label: '標題', max: 30 },
  { key: 'message', label: '說明文字', long: true, max: 200 },
  { key: 'guestNote', label: '訪客提醒(沒登入的顧客才會看到)', long: true, max: 120 },
  { key: 'paymentNote', label: '收款資訊下方的提醒', long: true, max: 120 },
  { key: 'lineTitle', label: 'LINE 區塊標題', max: 30 },
  { key: 'lineText', label: 'LINE 區塊說明', long: true, max: 120 },
  { key: 'lineButton', label: 'LINE 按鈕文字', max: 20 },
  { key: 'continueButton', label: '「繼續購物」按鈕文字', max: 20 },
];

export function resolveOrderCompleteTexts(raw: unknown): OrderCompleteTexts {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_ORDER_COMPLETE_TEXTS };
  for (const f of ORDER_COMPLETE_FIELDS) {
    const v = typeof src[f.key] === 'string' ? (src[f.key] as string).trim().slice(0, f.max) : '';
    if (v) out[f.key] = v;
  }
  return out;
}

// 存檔用:只留跟預設不同的(之後改預設文字時,沒改過的欄位會跟著更新)
export function cleanOrderCompleteTexts(raw: unknown): Partial<OrderCompleteTexts> {
  const r = resolveOrderCompleteTexts(raw);
  return Object.fromEntries(ORDER_COMPLETE_FIELDS.filter((f) => r[f.key] !== DEFAULT_ORDER_COMPLETE_TEXTS[f.key]).map((f) => [f.key, r[f.key]]));
}
