'use client';

import { createBrowserSupabase } from '@/lib/supabase/client';

// 登出並回到 POS 登入頁(換另一個帳號)
export async function posSignOut() {
  await createBrowserSupabase().auth.signOut();
  window.location.href = '/login?next=/pos';
}

export default function PosSignOut() {
  return <button type="button" onClick={() => void posSignOut()} className="mt-5 rounded-xl border border-[#1f1b19] bg-[#1f1b19] px-5 py-2.5 text-sm! font-semibold! text-white">換一個帳號登入</button>;
}
