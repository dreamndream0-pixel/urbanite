-- =============================================================
-- 訂單加上收件電話與地址(結帳收集、訂單明細顯示)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.orders
  add column if not exists phone   text default '',
  add column if not exists address text default '';
