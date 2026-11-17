// 店家可以用的功能(POS 相關)。平台管理員在後台「店家管理」逐店開關;沒設定的依方案預設。
// URBANITE(平台)永遠全開。前後端共用(不碰資料庫)。
export const SHOP_FEATURES = [
  { key: 'pos', label: 'POS 門市結帳', hint: '/pos 結帳、POS 按鈕、僅門市銷售商品' },
  { key: 'multi_location', label: '分店 / 倉庫調貨', hint: '多個據點、各據點庫存、調貨單' },
  { key: 'invoice', label: '發票號碼', hint: 'POS 結帳自動帶發票號碼、買方統編' },
  { key: 'staff', label: 'POS 員工帳號', hint: '員工編號登入、權限、銷售人員紀錄' },
] as const;
export type ShopFeature = (typeof SHOP_FEATURES)[number]['key'];
export type ShopFeatures = Record<ShopFeature, boolean>;

const ALL_ON: ShopFeatures = { pos: true, multi_location: true, invoice: true, staff: true };
const ALL_OFF: ShopFeatures = { pos: false, multi_location: false, invoice: false, staff: false };

// 方案預設:U Max 全開;U Pro(基本官網)預設都不開,要平台開通
export function planDefaults(plan: string | null | undefined): ShopFeatures {
  return plan === 'max' ? { ...ALL_ON } : { ...ALL_OFF };
}

type ShopLike = { id?: string; plan?: string | null; features?: unknown } | null | undefined;

// 這家店實際可以用的功能;POS 沒開時,其他 POS 功能也一律關閉
export function resolveShopFeatures(shop: ShopLike, platform = false): ShopFeatures {
  if (platform) return { ...ALL_ON };
  if (!shop) return { ...ALL_OFF };
  const base = planDefaults(shop.plan);
  const raw = shop.features && typeof shop.features === 'object' ? (shop.features as Record<string, unknown>) : {};
  const out = { ...base };
  for (const f of SHOP_FEATURES) if (typeof raw[f.key] === 'boolean') out[f.key] = raw[f.key] as boolean;
  if (!out.pos) return { ...ALL_OFF };
  return out;
}

// 後台送來的覆寫:只留認得的開關
export function cleanFeatureOverrides(raw: unknown): Partial<ShopFeatures> {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Partial<ShopFeatures> = {};
  for (const f of SHOP_FEATURES) if (typeof r[f.key] === 'boolean') out[f.key] = r[f.key] as boolean;
  return out;
}
