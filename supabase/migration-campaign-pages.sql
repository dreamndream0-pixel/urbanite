-- =============================================================
-- 一頁式促銷專頁與獨立商品
-- 到 Supabase SQL Editor 執行整份；可重複執行。
-- =============================================================

create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  eyebrow     text not null default 'LIMITED EDITION',
  title       text not null default '',
  description text not null default '',
  hero_image  text not null default '',
  status      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  start_at    timestamptz,
  end_at      timestamptz,
  theme_color text not null default '#702838',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.campaign_products (
  id                         uuid primary key default gen_random_uuid(),
  campaign_id                uuid not null references public.campaigns(id) on delete cascade,
  sku                        text not null default '',
  name                       text not null,
  tagline                    text not null default '',
  price                      integer not null default 0,
  original_price             integer,
  inventory                  integer not null default 0,
  status                     text not null default '上架中',
  category                   text not null default '',
  image                      text not null default '',
  images                     text[] not null default '{}',
  available_payment_methods  jsonb not null default '[]',
  available_shipping_methods jsonb not null default '[]',
  shipping_fee_overrides     jsonb not null default '{}',
  specs                      jsonb not null default '[]',
  variants                   jsonb not null default '[]',
  unit                       text not null default '',
  sale_mode                  text not null default '現貨',
  sort_order                 integer not null default 0,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (campaign_id, sku)
);

create index if not exists campaigns_slug_idx on public.campaigns(slug);
create index if not exists campaign_products_campaign_sort_idx on public.campaign_products(campaign_id, sort_order);

alter table public.campaigns enable row level security;
alter table public.campaign_products enable row level security;

drop policy if exists "published campaigns public read" on public.campaigns;
create policy "published campaigns public read"
  on public.campaigns for select
  using (status = 'published');

drop policy if exists "published campaign products public read" on public.campaign_products;
create policy "published campaign products public read"
  on public.campaign_products for select
  using (
    status = '上架中'
    and exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_products.campaign_id
        and campaigns.status = 'published'
    )
  );
