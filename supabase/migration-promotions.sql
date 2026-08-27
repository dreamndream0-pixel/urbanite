-- =============================================================
-- 促銷:折扣碼
-- =============================================================

create table if not exists public.discounts (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,             -- 折扣碼(客人輸入)
  type       text not null default 'percent',  -- percent(打折) | amount(折抵固定金額)
  value      integer not null default 0,        -- percent:10 表示 9 折;amount:100 表示折 100 元
  min_spend  integer not null default 0,        -- 最低消費門檻
  active     boolean not null default true,     -- 是否啟用
  created_at timestamptz not null default now()
);

alter table public.discounts enable row level security;
-- 折扣碼不開放公開讀取(避免被列舉),一律透過後端 API 驗證

-- 訂單記錄套用的折扣
alter table public.orders add column if not exists discount integer not null default 0;
alter table public.orders add column if not exists discount_code text default '';
