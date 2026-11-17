// POS 登入身分與權限(伺服器端)。
// POS 員工:後台建立「員工編號 + 密碼」,在 POS 登入頁登入(lib/pos-staff-session),只能做被勾選的項目,進不了後台。
// 管理員(後台能進的人)在 POS 什麼都能做。同一台裝置兩種都登入時,以員工身分為準(這筆單才會記在員工名下)。
import { cookies } from 'next/headers';
import { getAdminUser } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentShop, isPlatformShop, scopedClient } from '@/lib/shop';
import { resolveShopFeatures, SHOP_FEATURES, type ShopFeature, type ShopFeatures } from '@/lib/shop-features';
import { POS_PERMISSIONS, type PosPermission } from '@/lib/pos';
import { POS_STAFF_COOKIE, verifyStaffToken } from '@/lib/pos-staff-session';

export type PosUser = {
  staffId: string | null; // 管理員為 null
  code: string; // 員工編號;管理員為空
  email: string; // 管理員的 Email;員工為空
  name: string; // 顯示在收據「收銀」
  label: string; // 寫進紀錄的操作人員:管理員 = Email,員工 = 姓名(編號)
  isAdmin: boolean;
  permissions: PosPermission[];
  locationIds: string[]; // 空 = 全部據點
  features: ShopFeatures; // 這家店開通的功能
};

export type PosStaff = {
  id: string; code: string; name: string; permissions: PosPermission[]; location_ids: string[]; active: boolean;
  last_login_at?: string | null; created_at?: string;
  // 本月銷售(後台列表用)
  stats?: { orders: number; net: number };
};

const ALL = POS_PERMISSIONS.map((p) => p.key);

export function cleanPermissions(raw: unknown): PosPermission[] {
  return Array.isArray(raw) ? ALL.filter((k) => raw.includes(k)) : [];
}

// 目前店家開通的 POS 功能(平台在「店家管理」設定)
export async function currentShopFeatures(): Promise<ShopFeatures> {
  const shop = await getCurrentShop();
  return resolveShopFeatures(shop && shop.status !== 'suspended' ? shop : null, isPlatformShop(shop));
}

// API 用:這家店沒開通某個功能 → 回 403
export async function featureDenied(feature: ShopFeature) {
  if ((await currentShopFeatures())[feature]) return null;
  const label = SHOP_FEATURES.find((f) => f.key === feature)?.label ?? feature;
  return NextResponse.json({ error: `這家店尚未開通「${label}」`, code: 'FEATURE_DISABLED' }, { status: 403 });
}

// 目前這台裝置在這家店的 POS 身分;沒登入、或這家店沒開通 POS → null
// staffOnly:只看員工登入(POS 的「換人登入」用)
export async function getPosUser(options: { staffOnly?: boolean } = {}): Promise<PosUser | null> {
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended') return null;
  const features = resolveShopFeatures(shop, isPlatformShop(shop));
  if (!features.pos) return null;

  let token: string | undefined;
  try { token = (await cookies()).get(POS_STAFF_COOKIE)?.value; } catch { token = undefined; }
  // 沒開通「POS 員工帳號」時,員工登入不算數
  const staffId = features.staff ? verifyStaffToken(token, shop.id) : null;
  if (staffId) {
    const { data } = await scopedClient(shop.id).from('pos_staff').select('id,code,name,permissions,location_ids,active').eq('id', staffId).maybeSingle();
    if (data?.active) {
      const name = String(data.name || '').trim() || data.code;
      return {
        staffId: data.id, code: data.code, email: '', name, label: name === data.code ? name : `${name}(${data.code})`, isAdmin: false,
        permissions: cleanPermissions(data.permissions),
        locationIds: Array.isArray(data.location_ids) ? data.location_ids.map(String) : [],
        features,
      };
    }
  }
  if (options.staffOnly) return null;

  const admin = await getAdminUser();
  if (!admin) return null;
  return { staffId: null, code: '', email: admin.email ?? '', name: (admin.email ?? '').split('@')[0] || '管理員', label: admin.email ?? '', isAdmin: true, permissions: ALL, locationIds: [], features };
}

export const can = (user: PosUser, permission: PosPermission) => user.isAdmin || user.permissions.includes(permission);

// 這個人可以用的據點(沒開通「分店 / 倉庫調貨」時只有預設據點)
export function allowedLocations<T extends { id: string; is_default?: boolean }>(user: PosUser, locations: T[]): T[] {
  if (!user.features.multi_location) {
    const main = locations.filter((l) => l.is_default);
    return main.length ? main : locations.slice(0, 1);
  }
  if (user.isAdmin || !user.locationIds.length) return locations;
  const allowed = locations.filter((l) => user.locationIds.includes(l.id));
  return allowed.length ? allowed : locations; // 登記的據點都被刪掉時不要把人鎖在外面
}
