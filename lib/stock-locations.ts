// 分店 / 倉庫與各據點庫存(伺服器端)。資料表見 supabase/migration-pos-locations.sql。
// products 上的庫存是「全部據點的總庫存」;stock_levels 只記非預設據點,預設據點(總倉)= 總庫存 − 其他據點合計。
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Variant } from '@/lib/types';

export type StockLocation = {
  id: string;
  name: string;
  kind: 'store' | 'warehouse';
  is_default: boolean;
  active: boolean;
  sort_order: number;
  note: string;
  invoice_enabled: boolean;
  invoice_prefix: string;
  invoice_next: number;
  invoice_end: number;
};
export type StockLevel = { location_id: string; product_id: string; variant_key: string; quantity: number };
export type TransferLine = { product_id: string; variant_key: string; name: string; quantity: number };
export type StockTransfer = { id: string; doc_no: string; from_location: string | null; to_location: string | null; from_name: string; to_name: string; lines: TransferLine[]; handler: string; note: string; created_at: string };

const COLUMNS = 'id,name,kind,is_default,active,sort_order,note,invoice_enabled,invoice_prefix,invoice_next,invoice_end';

// 這家店的據點(沒有就先建一個預設的「總倉」)
export async function ensureLocations(db: SupabaseClient): Promise<StockLocation[]> {
  const read = () => db.from('stock_locations').select(COLUMNS).order('is_default', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  let { data } = await read();
  if (!data?.some((l) => l.is_default)) {
    // 兩個請求同時建立時,唯一索引會擋下其中一個,再讀一次即可
    await db.from('stock_locations').insert({ name: '總倉', kind: 'warehouse', is_default: true });
    ({ data } = await read());
  }
  return (data ?? []) as StockLocation[];
}

export const defaultLocation = (locations: StockLocation[]) => locations.find((l) => l.is_default) ?? locations[0];

// 選到的據點(沒帶、已停用或不存在 → 預設據點)
export function pickLocation(locations: StockLocation[], id: string | null | undefined) {
  return locations.find((l) => l.id === id && l.active) ?? defaultLocation(locations);
}

export async function loadLevels(db: SupabaseClient, productIds?: string[]) {
  let query = db.from('stock_levels').select('location_id,product_id,variant_key,quantity').gt('quantity', 0);
  if (productIds) query = query.in('product_id', productIds);
  const { data, error } = await query.limit(20000);
  if (error) throw new Error(error.message);
  return (data ?? []) as StockLevel[];
}

const levelKey = (productId: string, variantKey: string) => `${productId}\u0000${variantKey}`;

type StockShape = { id: string; inventory: number; variants: Variant[] };

// 某個據點看到的庫存:回傳 (商品, 規格) → 數量 的查詢函式
export function locationStockReader(products: StockShape[], levels: StockLevel[], location: StockLocation) {
  const here = new Map<string, number>();
  const elsewhere = new Map<string, number>();
  for (const l of levels) {
    const k = levelKey(l.product_id, l.variant_key);
    if (l.location_id === location.id) here.set(k, (here.get(k) ?? 0) + l.quantity);
    elsewhere.set(k, (elsewhere.get(k) ?? 0) + l.quantity);
  }
  const totals = new Map<string, number>();
  for (const p of products) {
    if (p.variants?.length) for (const v of p.variants) totals.set(levelKey(p.id, v.options.join(' / ')), v.inventory ?? 0);
    else totals.set(levelKey(p.id, ''), p.inventory ?? 0);
  }
  return (productId: string, variantKey: string) => {
    const k = levelKey(productId, variantKey);
    // 預設據點:總庫存扣掉放在其他據點的(官網賣超過時可能是負的 → 需要從分店調回)
    return location.is_default ? (totals.get(k) ?? 0) - (elsewhere.get(k) ?? 0) : here.get(k) ?? 0;
  };
}

// 把商品的庫存換成某個據點的庫存(POS 用;不低於 0)
export function withLocationStock<T extends StockShape>(products: T[], levels: StockLevel[], location: StockLocation): T[] {
  const read = locationStockReader(products, levels, location);
  return products.map((p) => {
    if (p.variants?.length) {
      const variants = p.variants.map((v) => ({ ...v, inventory: Math.max(0, read(p.id, v.options.join(' / '))) }));
      return { ...p, variants, inventory: variants.reduce((n, v) => n + v.inventory, 0) };
    }
    return { ...p, inventory: Math.max(0, read(p.id, '')) };
  });
}

// 增減非預設據點的數量(預設據點不存數量,不用動)
export async function adjustLevel(shopId: string, location: StockLocation, productId: string, variantKey: string, delta: number) {
  if (location.is_default || !delta) return;
  const { error } = await createAdminClient().rpc('stock_level_add', { p_shop: shopId, p_location: location.id, p_product: productId, p_variant: variantKey, p_delta: delta });
  if (error) throw new Error(error.message);
}

// 發票號碼設定的檢查:字軌是兩個大寫英文字母;號碼 8 位數以內
export function invoicePatch(body: Record<string, unknown>): { patch?: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};
  if ('invoice_enabled' in body) patch.invoice_enabled = body.invoice_enabled === true;
  if ('invoice_prefix' in body) {
    const prefix = String(body.invoice_prefix ?? '').trim().toUpperCase();
    if (prefix && !/^[A-Z]{2}$/.test(prefix)) return { error: '發票字軌是兩個英文字母(例:AB)' };
    patch.invoice_prefix = prefix;
  }
  for (const key of ['invoice_next', 'invoice_end'] as const) {
    if (!(key in body)) continue;
    const n = Math.floor(Number(body[key]));
    if (!Number.isSafeInteger(n) || n < 0 || n > 99_999_999) return { error: '發票號碼是 8 位數以內的數字' };
    patch[key] = n;
  }
  return { patch };
}
