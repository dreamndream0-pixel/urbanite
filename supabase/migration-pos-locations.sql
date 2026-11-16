-- =============================================================
-- 分店 / 倉庫、各點庫存、調貨單、POS 發票號碼、POS 按鈕。可重複執行,不刪資料。
--
-- 庫存模型(向後相容):
--   products.inventory / variants[].inventory 仍然是「全部據點的總庫存」(官網、訂單、盤點照舊)。
--   stock_levels 只記「非預設據點」各自有多少;預設據點(總倉)的數量 = 總庫存 − 其他據點合計。
--   調貨:只搬動 stock_levels,總庫存不變。POS 在分店銷貨:總庫存與該分店的 stock_levels 一起扣。
-- =============================================================

create table if not exists public.stock_locations (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  name            text not null,
  kind            text not null default 'store' check (kind in ('store', 'warehouse')),
  is_default      boolean not null default false,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  note            text not null default '',
  -- POS 發票號碼(每個據點各自的字軌與流水號)
  invoice_enabled boolean not null default false,
  invoice_prefix  text not null default '',
  invoice_next    integer not null default 1,
  invoice_end     integer not null default 99999999,
  created_at      timestamptz not null default now()
);
create index if not exists stock_locations_shop_idx on public.stock_locations (shop_id, sort_order);
create unique index if not exists stock_locations_one_default on public.stock_locations (shop_id) where is_default;

create table if not exists public.stock_levels (
  shop_id     uuid not null references public.shops(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  product_id  text not null,
  variant_key text not null default '',
  quantity    integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (location_id, product_id, variant_key)
);
create index if not exists stock_levels_shop_product_idx on public.stock_levels (shop_id, product_id);

create table if not exists public.stock_transfers (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  doc_no        text not null,
  from_location uuid,
  to_location   uuid,
  from_name     text not null default '',
  to_name       text not null default '',
  -- [{ product_id, variant_key, name, quantity }]
  lines         jsonb not null default '[]'::jsonb,
  handler       text not null default '',
  note          text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists stock_transfers_shop_created_idx on public.stock_transfers (shop_id, created_at desc);

alter table public.stock_locations enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_transfers enable row level security;
revoke all on public.stock_locations, public.stock_levels, public.stock_transfers from public, anon, authenticated;
grant select, insert, update, delete on public.stock_locations, public.stock_levels, public.stock_transfers to service_role;

-- 班別改成每個據點各自一班
alter table public.pos_sessions add column if not exists location_id uuid;
drop index if exists public.pos_sessions_one_open;
create unique index if not exists pos_sessions_one_open_per_location
  on public.pos_sessions (shop_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open';

-- 訂單:POS 據點、發票號碼、買方統編
alter table public.orders add column if not exists pos_location_id uuid;
alter table public.orders add column if not exists invoice_no text not null default '';
alter table public.orders add column if not exists buyer_tax_id text not null default '';

-- POS 首頁按鈕:[{ id, name, color, productIds:[] }]
alter table public.site_settings add column if not exists pos_buttons jsonb;

-- 增減某據點的庫存(原子操作,不低於 0),回傳新數量
create or replace function public.stock_level_add(p_shop uuid, p_location uuid, p_product text, p_variant text, p_delta integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare result integer;
begin
  insert into public.stock_levels (shop_id, location_id, product_id, variant_key, quantity)
  values (p_shop, p_location, p_product, coalesce(p_variant, ''), greatest(0, p_delta))
  on conflict (location_id, product_id, variant_key)
  do update set quantity = greatest(0, public.stock_levels.quantity + p_delta), updated_at = now()
  returning quantity into result;
  return result;
end $$;

-- 取下一張發票號碼(原子操作):未啟用或號碼用完回傳 null
create or replace function public.pos_next_invoice(p_shop uuid, p_location uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare loc record;
begin
  update public.stock_locations set invoice_next = invoice_next + 1
   where id = p_location and shop_id = p_shop and invoice_enabled and invoice_next <= invoice_end
  returning invoice_prefix, invoice_next - 1 as used into loc;
  if not found then return null; end if;
  return loc.invoice_prefix || lpad(loc.used::text, 8, '0');
end $$;

revoke all on function public.stock_level_add(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.pos_next_invoice(uuid, uuid) from public, anon, authenticated;
grant execute on function public.stock_level_add(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.pos_next_invoice(uuid, uuid) to service_role;
