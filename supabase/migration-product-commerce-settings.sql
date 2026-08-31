-- =============================================================
-- 商品多圖 + 商品可用金流/物流 + 全站金流/物流設定
-- 到 Supabase 後台 -> SQL Editor -> 貼上整份 -> Run(重複執行安全)
-- =============================================================

alter table public.products
  add column if not exists images text[] not null default '{}',
  add column if not exists available_payment_methods jsonb not null default '[]',
  add column if not exists available_shipping_methods jsonb not null default '[]';

update public.products
set images = array[image]
where image is not null
  and image <> ''
  and (images is null or cardinality(images) = 0);

alter table public.site_settings
  add column if not exists payment_methods jsonb not null default '["綠界金流","Line Pay","Apple Pay","取貨付款","轉帳匯款"]',
  add column if not exists shipping_methods jsonb not null default '["綠界物流-超商取貨","綠界物流-宅配","7-11 取貨付款","全家 取貨付款"]',
  add column if not exists enabled_payment_methods jsonb not null default '["綠界金流","Line Pay","Apple Pay","取貨付款","轉帳匯款"]',
  add column if not exists enabled_shipping_methods jsonb not null default '["綠界物流-超商取貨","綠界物流-宅配","7-11 取貨付款","全家 取貨付款"]';

alter table public.orders
  add column if not exists shipping_method text default '',
  add column if not exists payment_method text default '';

alter table public.customers
  add column if not exists phone text;
