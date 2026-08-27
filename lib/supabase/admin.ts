import { createClient } from '@supabase/supabase-js';

// 後端專用:使用 service_role 金鑰,會繞過 RLS。
// 只能在伺服器端(API route / server component)使用,絕不可送到瀏覽器。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('缺少 Supabase 環境變數(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
