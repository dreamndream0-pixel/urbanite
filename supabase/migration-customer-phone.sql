-- =============================================================
-- 顧客資料表加上手機欄位(支援手機註冊)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.customers
  add column if not exists phone text default '';
