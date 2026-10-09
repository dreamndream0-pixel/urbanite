-- 多店家(第 0 階段):店家表、店家成員,所有商城資料加上 shop_id
-- 現有資料全部歸給 URBANITE(第 1 家店,固定 id),目前的網站不受影響。可重複執行。

create table if not exists public.shops (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,                 -- 子網域:slug.urbanite.com.tw
  name          text not null default '',
  owner_user_id uuid,
  plan          text not null default 'pro',          -- pro(手動匯款 / 自行寄件)| max
  status        text not null default 'active',       -- active | suspended
  custom_domain text unique,                          -- 之後的自訂網域
  created_at    timestamptz not null default now()
);

create table if not exists public.shop_members (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  user_id    uuid not null,
  role       text not null default 'owner',           -- owner | staff
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index if not exists shop_members_user_idx on public.shop_members (user_id);

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;

insert into public.shops (id, slug, name, plan)
values ('00000000-0000-0000-0000-000000000001', 'urbanite', 'URBANITE', 'max')
on conflict (id) do nothing;

-- 每張商城資料表加上 shop_id(預設 = URBANITE)
do $$
declare t text;
begin
  foreach t in array array[
    'banners', 'campaigns', 'campaign_products', 'categories', 'customers', 'discounts',
    'user_coupons', 'coupon_usages', 'favorites', 'orders', 'order_status_history', 'payments',
    'refunds', 'returns', 'shipments', 'shipment_events', 'products', 'site_settings', 'stock_movements'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format(
      'alter table public.%I add column if not exists shop_id uuid not null default %L references public.shops(id)',
      t, '00000000-0000-0000-0000-000000000001');
    execute format('create index if not exists %I on public.%I (shop_id)', t || '_shop_id_idx', t);
  end loop;
end $$;

-- 原本「全站唯一」的欄位改成「同一家店內唯一」
do $$
declare r record;
begin
  -- 找出單一欄位的唯一限制並移除(主鍵不動)
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'u' and array_length(c.conkey, 1) = 1
      and ((c.conrelid = 'public.discounts'::regclass and a.attname = 'code')
        or (c.conrelid = 'public.categories'::regclass and a.attname = 'slug')
        or (c.conrelid = 'public.campaigns'::regclass and a.attname = 'slug')
        or (c.conrelid = 'public.customers'::regclass and a.attname = 'user_id'))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

create unique index if not exists discounts_shop_code_key on public.discounts (shop_id, code);
create unique index if not exists categories_shop_slug_key on public.categories (shop_id, slug);
create unique index if not exists campaigns_shop_slug_key on public.campaigns (shop_id, slug);
create unique index if not exists customers_shop_user_key on public.customers (shop_id, user_id);

-- LINE 綁定:同一家店內唯一
drop index if exists public.customers_line_user_id_key;
create unique index if not exists customers_shop_line_user_key on public.customers (shop_id, line_user_id) where line_user_id is not null;

-- 網站設定:每家店一筆(原本固定 id = 1,且有「只能一筆」的限制)
alter table public.site_settings drop constraint if exists single_row;
create sequence if not exists public.site_settings_id_seq start with 2 owned by public.site_settings.id;
select setval('public.site_settings_id_seq', greatest((select max(id) from public.site_settings), 1));
alter table public.site_settings alter column id set default nextval('public.site_settings_id_seq');
create unique index if not exists site_settings_shop_key on public.site_settings (shop_id);
