-- =============================================================
-- 退貨:買家寄回的物流資訊(物流公司 / 單號)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.returns
  add column if not exists return_carrier  text default '', -- 買家寄回的物流公司
  add column if not exists return_tracking text default '', -- 買家寄回的物流單號
  add column if not exists shipped_back_at  timestamptz;
