// POS 伺服器端共用:庫存增減、單號、班別摘要。
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Order, Product, Variant } from '@/lib/types';
import { summarizeSession, variantKey, type PosProduct, type PosSession } from '@/lib/pos';

type StockLine = { productId: string; variant: string; quantity: number };

// 依明細增減庫存(delta:-1 銷貨、+1 退貨回補),同商品多規格用工作副本累積,最後每個商品寫一次
export async function applyStockLines(supabase: SupabaseClient, products: Map<string, Product>, lines: StockLine[], delta: 1 | -1) {
  const working = new Map<string, { inventory: number; variants: Variant[] }>();
  for (const line of lines) {
    const base = products.get(line.productId);
    if (!base) continue;
    const w = working.get(line.productId) ?? { inventory: base.inventory, variants: (Array.isArray(base.variants) ? base.variants : []).map((v) => ({ ...v })) };
    if (w.variants.length > 0) {
      const v = w.variants.find((vv) => variantKey(vv.options) === line.variant);
      if (v) v.inventory = Math.max(0, (v.inventory ?? 0) + delta * line.quantity);
      w.inventory = w.variants.reduce((n, vv) => n + (vv.inventory ?? 0), 0);
    } else {
      w.inventory = Math.max(0, (w.inventory ?? 0) + delta * line.quantity);
    }
    working.set(line.productId, w);
  }
  for (const [pid, w] of working) {
    const { error } = await supabase.from('products').update({ inventory: w.inventory, variants: w.variants }).eq('id', pid);
    if (error) throw new Error(error.message);
  }
}

// 訂單編號:與官網同一套(UR + 台灣日期 + 當日流水號),全站唯一
export async function nextOrderNo(offset = 0) {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const prefix = `UR${tw.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const { count } = await createAdminClient().from('orders').select('order_no', { count: 'exact', head: true }).like('order_no', `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1 + offset).padStart(4, '0')}`;
}

export async function nextRefundNo() {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const prefix = `RF${tw.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const { count } = await createAdminClient().from('refunds').select('refund_no', { count: 'exact', head: true }).like('refund_no', `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`;
}

// 某個據點目前營業中的班別(每個據點各自一班;預設據點也包含還沒有據點時開的班)
export async function openSession(supabase: SupabaseClient, location: { id: string; is_default: boolean }) {
  const base = supabase.from('pos_sessions').select('*').eq('status', 'open');
  const { data } = await (location.is_default ? base.or(`location_id.eq.${location.id},location_id.is.null`) : base.eq('location_id', location.id)).order('opened_at', { ascending: false }).limit(1).maybeSingle();
  return (data as PosSession | null) ?? null;
}

// 班別 + 即時摘要(這一班的成交、各付款方式、應有現金)
export async function sessionWithSummary(supabase: SupabaseClient, session: PosSession) {
  const { data } = await supabase.from('orders').select('items,total,pos').eq('pos_session_id', session.id);
  return { ...session, summary: summarizeSession(session, (data ?? []) as Pick<Order, 'items' | 'total' | 'pos'>[]) };
}

export const POS_PRODUCT_COLUMNS = 'id,name,price,inventory,status,category,image,specs,variants,unit,campaign_id,barcode,sort_order,created_at';

export async function loadPosProducts(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('products').select(POS_PRODUCT_COLUMNS).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PosProduct[];
}

// 台灣時間某一天的起訖(UTC ISO)
export function taipeiDayRange(date: string) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+08:00`);
  return { day, from: start.toISOString(), to: new Date(start.getTime() + 24 * 3600 * 1000).toISOString() };
}
