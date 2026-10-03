-- =============================================================
-- 後台「串接設定」:金流 / 物流 / LINE 等金鑰改在後台設定(不必每次到 Vercel)
-- 值以 AES-256-GCM 加密後存放;只有後端 service_role 能讀寫(RLS 開啟、不給任何公開政策)。
-- 到 Supabase SQL Editor 執行整份；可重複執行。
-- =============================================================

create table if not exists public.integration_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.integration_settings enable row level security;
-- 不建立任何 policy:anon / authenticated 一律無法存取,僅後端 service_role 可讀寫。
