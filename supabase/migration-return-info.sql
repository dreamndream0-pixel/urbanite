-- =============================================================
-- 網站設定:退貨收件資訊(賣家的退貨寄回地址/聯絡方式,顯示給買家)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.site_settings
  add column if not exists return_info text default '';
