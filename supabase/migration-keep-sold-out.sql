-- 完售不下架:勾選的商品賣完仍顯示在前台(標示已售完、不能購買),方便補貨。可重複執行。
alter table public.products add column if not exists keep_when_sold_out boolean not null default false;
