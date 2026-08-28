-- =============================================================
-- 進銷存:單位欄位 + 進出庫紀錄表
-- variant 內的 cost(單位成本)/safety(安全庫存)/location(儲位) 存在 products.variants jsonb 內,不需改結構。
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.products
  add column if not exists unit text default '';

-- 進出庫紀錄:目前庫存 = 期初 + 所有入庫 - 所有出庫(由紀錄推算,不手動改)
create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null,
  variant_key text default '',           -- 規格組合(options 用 ' / ' 串起),無規格為空
  type        text not null,             -- 'in'(入庫)| 'out'(出庫)
  quantity    integer not null,          -- 正整數
  unit_price  integer not null default 0,-- 單價
  location    text default '',           -- 使用地點 / 對象
  handler     text default '',           -- 經手人
  note        text default '',           -- 備註
  created_at  timestamptz not null default now()
);

create index if not exists stock_movements_created_idx on public.stock_movements (created_at desc);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id);

alter table public.stock_movements enable row level security;
-- 只透過後端 API(service_role)存取。
