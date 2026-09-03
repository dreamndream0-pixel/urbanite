-- =============================================================
-- 訂單:非綠界付款(如銀行轉帳)的買家付款證明
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.orders
  add column if not exists payment_ref        text default '', -- 轉出帳號後五碼 / 轉出帳號
  add column if not exists payment_proof_url  text default '', -- 上傳的付款截圖網址
  add column if not exists payment_proof_note text default ''; -- 買家補充說明
