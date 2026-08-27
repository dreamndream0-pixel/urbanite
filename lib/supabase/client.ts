'use client';

import { createBrowserClient } from '@supabase/ssr';

// 瀏覽器端的 client:用來觸發社群登入(Google / Facebook 等)。
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
