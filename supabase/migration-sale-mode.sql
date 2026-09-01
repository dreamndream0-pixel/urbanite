-- =============================================================
-- 商品銷售模式:現貨 / 預購 / 預購+現貨
-- =============================================================

alter table public.products
  add column if not exists sale_mode text not null default '現貨';
