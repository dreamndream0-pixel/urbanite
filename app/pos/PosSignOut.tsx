'use client';

import { createBrowserSupabase } from '@/lib/supabase/client';

// POS 登出:員工清掉員工登入;管理員另外登出後台帳號。之後回到 POS 員工登入頁。
export async function posSignOut(isAdmin: boolean) {
  await fetch('/api/pos/login', { method: 'DELETE' }).catch(() => {});
  if (isAdmin) await createBrowserSupabase().auth.signOut().catch(() => {});
  window.location.href = '/pos';
}

// 換人登入:管理員的裝置上讓員工用自己的編號登入(不登出管理員的後台)
export function posSwitchUser() {
  window.location.href = '/pos?login=1';
}
