-- =============================================================
-- 會員優惠券 MVP + 會員完整資料
-- =============================================================

alter table public.customers
  add column if not exists address text default '';

alter table public.discounts
  add column if not exists name text default '',
  add column if not exists max_discount integer,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists total_limit integer,
  add column if not exists per_user_limit integer not null default 1,
  add column if not exists stackable boolean not null default false,
  add column if not exists status text not null default '啟用';

create table if not exists public.user_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  coupon_id uuid not null references public.discounts(id) on delete cascade,
  status text not null default 'available',
  received_at timestamptz not null default now(),
  used_at timestamptz,
  expired_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,
  unique (user_id, coupon_id)
);

create index if not exists user_coupons_user_id_idx on public.user_coupons(user_id);
create index if not exists user_coupons_coupon_id_idx on public.user_coupons(coupon_id);
create index if not exists user_coupons_status_idx on public.user_coupons(status);

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.discounts(id) on delete cascade,
  user_id uuid,
  user_coupon_id uuid references public.user_coupons(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  original_amount integer not null default 0,
  discount_amount integer not null default 0,
  final_amount integer not null default 0,
  used_at timestamptz not null default now()
);

create index if not exists coupon_usages_coupon_id_idx on public.coupon_usages(coupon_id);
create index if not exists coupon_usages_user_id_idx on public.coupon_usages(user_id);
create index if not exists coupon_usages_order_id_idx on public.coupon_usages(order_id);

alter table public.user_coupons enable row level security;
alter table public.coupon_usages enable row level security;

-- 會員優惠券與使用紀錄一律透過後端 service_role 存取。
