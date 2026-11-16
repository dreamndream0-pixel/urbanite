// POS 登入身分與權限(伺服器端)。
// 管理員(後台能進的人)在 POS 什麼都能做;POS 員工(pos_staff)只能做被勾選的項目,而且進不了後台。
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { getCurrentShop, scopedClient } from '@/lib/shop';
import { POS_PERMISSIONS, type PosPermission } from '@/lib/pos';

export type PosUser = {
  email: string;
  name: string; // 顯示在收據「收銀」
  label: string; // 寫進紀錄的操作人員:管理員 = Email,員工 = 姓名
  isAdmin: boolean;
  permissions: PosPermission[];
  locationIds: string[]; // 空 = 全部據點
};

export type PosStaff = { id: string; email: string; name: string; permissions: PosPermission[]; location_ids: string[]; active: boolean; created_at?: string };

const ALL = POS_PERMISSIONS.map((p) => p.key);

export function cleanPermissions(raw: unknown): PosPermission[] {
  return Array.isArray(raw) ? ALL.filter((k) => raw.includes(k)) : [];
}

// 目前登入者在這家店的 POS 身分;不是管理員也不是 POS 員工 → null
export async function getPosUser(): Promise<PosUser | null> {
  const admin = await getAdminUser();
  if (admin) return { email: admin.email ?? '', name: (admin.email ?? '').split('@')[0] || '管理員', label: admin.email ?? '', isAdmin: true, permissions: ALL, locationIds: [] };
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email) return null;
  // 自己填 Email 註冊但還沒驗證的帳號不算(避免有人搶先用員工的 Email 註冊)
  const verified = Boolean(user.email_confirmed_at) || (user.app_metadata?.provider ?? 'email') !== 'email';
  if (!verified) return null;
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended') return null;
  const { data } = await scopedClient(shop.id).from('pos_staff').select('email,name,permissions,location_ids,active').eq('email', email).maybeSingle();
  if (!data || !data.active) return null;
  return {
    email, name: String(data.name || '').trim() || email.split('@')[0], label: String(data.name || '').trim() || email, isAdmin: false,
    permissions: cleanPermissions(data.permissions),
    locationIds: Array.isArray(data.location_ids) ? data.location_ids.map(String) : [],
  };
}

export const can = (user: PosUser, permission: PosPermission) => user.isAdmin || user.permissions.includes(permission);

// 這個人可以用的據點
export function allowedLocations<T extends { id: string }>(user: PosUser, locations: T[]): T[] {
  if (user.isAdmin || !user.locationIds.length) return locations;
  const allowed = locations.filter((l) => user.locationIds.includes(l.id));
  return allowed.length ? allowed : locations; // 登記的據點都被刪掉時不要把人鎖在外面
}
