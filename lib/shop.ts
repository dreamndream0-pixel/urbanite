import { cache } from 'react';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROOT_DOMAIN, shopSlugFromHost } from '@/lib/shop-host';

export { ROOT_DOMAIN, shopSlugFromHost };

// ---------- 多店家 ----------
// 每家店一個子網域:slug.urbanite.com.tw;主網域(urbanite.com.tw / www / 本機 / Vercel 預覽)= URBANITE(第 1 家店)

export const URBANITE_SHOP_ID = '00000000-0000-0000-0000-000000000001';

export type Shop = {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string | null;
  plan: 'pro' | 'max' | string;
  status: 'active' | 'suspended' | string;
  custom_domain: string | null;
  created_at?: string;
};

// 店家網址代稱:小寫英數與連字號,3–30 字;平台保留字不能用
export const SHOP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
export const RESERVED_SHOP_SLUGS = new Set([
  'www', 'urbanite', 'admin', 'api', 'app', 'card', 'cards', 'shop', 'shops', 'store', 'stores', 'mail', 'email', 'smtp', 'ftp',
  'static', 'cdn', 'assets', 'img', 'images', 'help', 'support', 'docs', 'blog', 'status', 'dev', 'test', 'staging', 'preview',
  'login', 'register', 'account', 'auth', 'billing', 'pay', 'payment', 'checkout', 'line', 'urbanlinks', 'official', 'system',
]);

export function shopUrl(slug: string, path = '/') {
  if (slug === 'urbanite') return `https://${ROOT_DOMAIN}${path}`;
  return `https://${slug}.${ROOT_DOMAIN}${path}`;
}

// 目前這次請求的店家(同一次請求只查一次)
export const getCurrentShop = cache(async (): Promise<Shop | null> => {
  let host = '';
  try {
    const h = await headers();
    host = h.get('x-forwarded-host') || h.get('host') || '';
  } catch {
    host = '';
  }
  const slug = shopSlugFromHost(host);
  const supabase = createAdminClient();
  if (!slug) {
    const { data } = await supabase.from('shops').select('*').eq('id', URBANITE_SHOP_ID).maybeSingle();
    // 遷移還沒跑時也能運作
    return (data as Shop | null) ?? { id: URBANITE_SHOP_ID, slug: 'urbanite', name: 'URBANITE', owner_user_id: null, plan: 'max', status: 'active', custom_domain: null };
  }
  const { data } = await supabase.from('shops').select('*').eq('slug', slug).maybeSingle();
  return (data as Shop | null) ?? null;
});

// 目前店家;找不到(網址打錯或停用)時丟錯,API 會回 404
export async function requireCurrentShop() {
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended') throw new ShopNotFoundError();
  return shop;
}
export class ShopNotFoundError extends Error {
  constructor() {
    super('找不到這家店');
  }
}

// 是不是主網站(URBANITE);找不到店家(網址打錯)一律不是
export const isPlatformShop = (shop: Pick<Shop, 'id'> | null | undefined) => Boolean(shop) && shop!.id === URBANITE_SHOP_ID;

// ---------- 店家範圍的資料庫 client ----------
// 這些資料表屬於某一家店:讀、改、刪自動加上 shop_id 條件,新增自動帶入 shop_id
export const SHOP_TABLES = new Set([
  'banners', 'campaigns', 'campaign_products', 'categories', 'customers', 'discounts', 'user_coupons', 'coupon_usages',
  'favorites', 'orders', 'order_status_history', 'payments', 'refunds', 'returns', 'shipments', 'shipment_events',
  'products', 'site_settings', 'stock_movements',
]);

function withShop<T>(values: T, shopId: string): T {
  if (Array.isArray(values)) return values.map((v) => ({ ...v, shop_id: shopId })) as T;
  if (values && typeof values === 'object') return { ...(values as object), shop_id: shopId } as T;
  return values;
}

// 包一層:只攔截 from(店家資料表),其他(rpc、storage、平台資料表)照舊
export function scopedClient(shopId: string, base: SupabaseClient = createAdminClient()): SupabaseClient {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop !== 'from') return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = target.from(table);
        if (!SHOP_TABLES.has(table)) return builder;
        return new Proxy(builder, {
          get(b, method, r) {
            const fn = Reflect.get(b, method, r);
            if (typeof fn !== 'function') return fn;
            switch (method) {
              case 'select':
                return (...args: unknown[]) => fn.apply(b, args).eq('shop_id', shopId);
              case 'update':
                return (values: unknown, ...args: unknown[]) => fn.apply(b, [withShop(values, shopId), ...args]).eq('shop_id', shopId);
              case 'delete':
                return (...args: unknown[]) => fn.apply(b, args).eq('shop_id', shopId);
              case 'insert':
              case 'upsert':
                return (values: unknown, ...rest: unknown[]) => fn.apply(b, [withShop(values, shopId), ...rest]);
              default:
                return fn.bind(b);
            }
          },
        });
      };
    },
  });
}

// 目前店家的資料庫 client(service role,已限定在這家店)
// 網址找不到店家或已停用:回傳一個查不到任何資料的 client(不會誤讀到別家店)
const NO_SHOP_ID = '00000000-0000-0000-0000-000000000000';
export async function shopAdminClient() {
  const shop = await getCurrentShop();
  return scopedClient(shop && shop.status !== 'suspended' ? shop.id : NO_SHOP_ID);
}

// 這家店的網站設定(每家店一筆)
export async function getShopSettings<T = Record<string, unknown>>(columns = '*') {
  const shop = await requireCurrentShop();
  const { data } = await scopedClient(shop.id).from('site_settings').select(columns).maybeSingle();
  return (data as T | null) ?? null;
}
