-- =============================================================
-- 階段一:商品分類
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

-- 商品加上「分類」欄位
alter table public.products
  add column if not exists category text default '';

-- 給現有商品設定分類
-- 分類代碼:new(新品) spring(春) summer(夏) autumn(秋) winter(冬) acc(飾品)
update public.products set category = 'new'    where id = 'love-set'   and (category is null or category = '');
update public.products set category = 'winter' where id = 'silk-slip'  and (category is null or category = '');
update public.products set category = 'acc'    where id = 'scent-card' and (category is null or category = '');
