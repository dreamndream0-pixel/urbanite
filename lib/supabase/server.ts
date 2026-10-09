import { createServerClient } from '@supabase/ssr';
import { getAdminEmails } from '@/lib/integrations';
import { cookies } from 'next/headers';

// 伺服器端的登入用 client:透過 cookie 讀寫使用者的登入狀態(session)。
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 從 Server Component 呼叫時無法寫 cookie,交給 middleware 處理即可。
        }
      },
    },
  });
}

// 取得目前登入者(任何登入的客人或管理員;未登入回 null)。
export async function getSessionUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error ? null : user ?? null;
}

// 判斷目前登入者是否為管理員(email 在白名單內)。
export async function getAdminUser() {
  try {
    const user = await getSessionUser();
    if (!user?.email) return null;
    const allow = await getAdminEmails();
    // An empty or unavailable allowlist must never grant administrator access.
    return allow.includes(user.email.trim().toLowerCase()) ? user : null;
  } catch {
    return null;
  }
}
