-- =============================================================
-- 庫存盤點單。可重複執行,不刪資料。
-- 建立時把系統庫存拍成快照(lines),逐項填實盤數量;完成盤點時依「實盤 − 當下系統庫存」
-- 寫入 stock_movements(盤點調整)並更新商品庫存。
-- =============================================================
create table if not exists public.stocktakes (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  doc_no        text not null,
  title         text not null default '',
  status        text not null default 'draft' check (status in ('draft', 'done', 'void')),
  scope         text not null default '',            -- 盤點範圍說明(全部 / 分類名稱)
  handler       text not null default '',
  note          text not null default '',
  -- [{ product_id, variant_key, name, spec, unit, location, cost, system_qty, counted_qty|null, adjusted?, qty_before? }]
  lines         jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists stocktakes_shop_created_idx on public.stocktakes (shop_id, created_at desc);
create unique index if not exists stocktakes_shop_doc_key on public.stocktakes (shop_id, doc_no);

alter table public.stocktakes enable row level security;
-- 只透過後端 API(service_role)存取。
