-- =============================================================
-- 賣場流量分析(報表及分析 → 流量分析)
-- shop_events:進站(visit,每次造訪一次)、商品點擊(product_click,從列表點進商品)、商品頁瀏覽(product_view)、加入購物車(add_cart)
-- visitor 是瀏覽器端產生的匿名代碼(不含個資);source 為來源(LINE / Instagram / Facebook / Google / 直接進站⋯)
-- shop_traffic_stats(shop, from, to):一次回傳總計、每日、來源、商品排行(JSON)
-- 可重複執行。
-- =============================================================
begin;

create table if not exists public.shop_events (
  id          bigint generated always as identity primary key,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  type        text not null check (type in ('visit', 'product_view', 'product_click', 'add_cart')),
  product_id  text,
  campaign_id uuid,
  page        text not null default '',
  source      text not null default 'direct',
  visitor     text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists shop_events_shop_time_idx on public.shop_events (shop_id, created_at desc);
create index if not exists shop_events_shop_type_idx on public.shop_events (shop_id, type, created_at desc);
alter table public.shop_events enable row level security;

create or replace function public.shop_traffic_stats(p_shop uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public as $$
  with e as (
    select * from public.shop_events where shop_id = p_shop and created_at >= p_from and created_at < p_to
  ),
  totals as (
    select
      count(*) filter (where type = 'visit') as visits,
      count(distinct visitor) filter (where type = 'visit' and visitor <> '') as visitors,
      count(*) filter (where type = 'product_click') as clicks,
      count(*) filter (where type = 'product_view') as views,
      count(distinct visitor) filter (where type = 'product_view' and visitor <> '') as viewers,
      count(*) filter (where type = 'add_cart') as carts
    from e
  ),
  daily as (
    select to_char(created_at at time zone 'Asia/Taipei', 'YYYY-MM-DD') as day,
      count(*) filter (where type = 'visit') as visits,
      count(distinct visitor) filter (where type = 'visit' and visitor <> '') as visitors,
      count(*) filter (where type = 'product_view') as views
    from e group by 1
  ),
  sources as (
    select source, count(*) as visits from e where type = 'visit' group by source order by 2 desc limit 12
  ),
  products as (
    select e.product_id,
      count(*) filter (where type = 'product_click') as clicks,
      count(*) filter (where type = 'product_view') as views,
      count(distinct visitor) filter (where type = 'product_view' and visitor <> '') as viewers,
      count(*) filter (where type = 'add_cart') as carts
    from e where e.product_id is not null group by e.product_id
  ),
  orders_in as (
    select count(*) as orders, coalesce(sum(total), 0) as revenue
    from public.orders where shop_id = p_shop and created_at >= p_from and created_at < p_to and status not in ('取消')
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'orders', (select to_jsonb(o) from orders_in o),
    'daily', coalesce((select jsonb_agg(d order by d.day) from daily d), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(s) from sources s), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(x order by x.views desc, x.clicks desc) from (
        select p.*, coalesce(pr.name, '(已刪除的商品)') as name, coalesce(pr.image, '') as image
        from products p left join public.products pr on pr.id::text = p.product_id and pr.shop_id = p_shop
        order by p.views desc, p.clicks desc limit 30
      ) x
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.shop_traffic_stats(uuid, timestamptz, timestamptz) from public, anon, authenticated;

commit;
