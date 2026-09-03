-- =============================================================
-- 網站設定:非綠界付款方式的收款帳號資訊(例:銀行轉帳帳號)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- 結構:[{ "name": "銀行轉帳", "info": "銀行/戶名/帳號…" }]
-- =============================================================

alter table public.site_settings
  add column if not exists payment_accounts jsonb not null default '[]';
