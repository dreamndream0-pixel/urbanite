-- =============================================================
-- 訂單加上「備註」欄位(客人結帳時可填,後台可看)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.orders
  add column if not exists note text default '';
