// 結帳自訂欄位(系統設定 → 結帳欄位):店家自己加的收件資料欄位
// 每個欄位可設:必填 / 選填、啟用 / 停用,以及什麼時候出現(全部訂單、購物車含指定分類、指定活動、指定配送方式)
// 存在 site_settings.checkout_fields;顧客填的答案存在 orders.custom_fields [{ id, label, value }]
export type CheckoutFieldType = 'text' | 'textarea' | 'select' | 'date';
export type CheckoutFieldScope = 'all' | 'categories' | 'campaigns' | 'shipping';
export type CheckoutField = {
  id: string;
  label: string;
  type: CheckoutFieldType;
  options: string[]; // 選單選項
  placeholder: string;
  required: boolean;
  active: boolean;
  scope: CheckoutFieldScope;
  categories: string[]; // 分類代碼(含子分類代碼)
  campaigns: string[]; // 活動 id
  shipping: string[]; // 配送方式名稱
};
export type CheckoutAnswer = { id: string; label: string; value: string };

export const MAX_CHECKOUT_FIELDS = 12;
export const FIELD_TYPE_LABEL: Record<CheckoutFieldType, string> = { text: '單行文字', textarea: '多行文字', select: '選單', date: '日期' };
export const FIELD_SCOPE_LABEL: Record<CheckoutFieldScope, string> = { all: '全部訂單', categories: '購物車有指定分類的商品', campaigns: '指定活動頁的訂單', shipping: '選了指定配送方式' };

const strList = (v: unknown, max: number, len = 60) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, max) : []);

export function resolveCheckoutFields(raw: unknown): CheckoutField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f, i) => {
      const type = (['text', 'textarea', 'select', 'date'] as const).includes(f.type as CheckoutFieldType) ? (f.type as CheckoutFieldType) : 'text';
      const scope = (['all', 'categories', 'campaigns', 'shipping'] as const).includes(f.scope as CheckoutFieldScope) ? (f.scope as CheckoutFieldScope) : 'all';
      return {
        id: typeof f.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(f.id) ? f.id : `field-${i + 1}`,
        label: typeof f.label === 'string' ? f.label.trim().slice(0, 40) : '',
        type,
        options: type === 'select' ? strList(f.options, 30, 40) : [],
        placeholder: typeof f.placeholder === 'string' ? f.placeholder.trim().slice(0, 80) : '',
        required: Boolean(f.required),
        active: f.active !== false,
        scope,
        categories: scope === 'categories' ? strList(f.categories, 50) : [],
        campaigns: scope === 'campaigns' ? strList(f.campaigns, 50) : [],
        shipping: scope === 'shipping' ? strList(f.shipping, 20) : [],
      };
    })
    .filter((f) => f.label && (f.type !== 'select' || f.options.length))
    .slice(0, MAX_CHECKOUT_FIELDS);
}

// 這筆訂單要顯示哪些欄位
export function fieldsForOrder(fields: CheckoutField[], ctx: { categories: string[]; campaignIds: string[]; shippingMethod: string }) {
  return fields.filter((f) => {
    if (!f.active) return false;
    if (f.scope === 'categories') return f.categories.some((c) => ctx.categories.includes(c));
    if (f.scope === 'campaigns') return f.campaigns.some((c) => ctx.campaignIds.includes(c));
    if (f.scope === 'shipping') return f.shipping.includes(ctx.shippingMethod);
    return true;
  });
}

// 伺服器端檢查答案:必填要有值、選單要是選項之一、日期格式;回傳要存進訂單的內容
export function validateAnswers(fields: CheckoutField[], raw: unknown): { answers: CheckoutAnswer[]; error?: string } {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: CheckoutAnswer[] = [];
  for (const f of fields) {
    const value = typeof input[f.id] === 'string' ? (input[f.id] as string).trim().slice(0, f.type === 'textarea' ? 500 : 120) : '';
    if (!value) {
      if (f.required) return { answers, error: `請填寫「${f.label}」` };
      continue;
    }
    if (f.type === 'select' && !f.options.includes(value)) return { answers, error: `「${f.label}」請從選項中選擇` };
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { answers, error: `「${f.label}」日期格式不正確` };
    answers.push({ id: f.id, label: f.label, value });
  }
  return { answers };
}
