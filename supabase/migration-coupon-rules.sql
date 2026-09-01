-- =============================================================
-- 優惠券完整規則欄位與訂單快照
-- =============================================================

alter table public.discounts
  add column if not exists applicable_products jsonb not null default '[]',
  add column if not exists applicable_categories jsonb not null default '[]',
  add column if not exists applicable_users text not null default 'all',
  add column if not exists is_first_purchase_only boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_coupons
  add column if not exists locked_at timestamptz,
  add column if not exists lock_expires_at timestamptz,
  add column if not exists revoked_at timestamptz;

alter table public.orders
  add column if not exists coupon_id uuid references public.discounts(id) on delete set null,
  add column if not exists user_coupon_id uuid references public.user_coupons(id) on delete set null,
  add column if not exists coupon_snapshot jsonb not null default '{}';

create index if not exists discounts_code_idx on public.discounts(code);
create index if not exists discounts_status_idx on public.discounts(status);
create index if not exists orders_coupon_id_idx on public.orders(coupon_id);
create index if not exists orders_user_coupon_id_idx on public.orders(user_coupon_id);

create or replace function public.set_discounts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists discounts_set_updated_at on public.discounts;
create trigger discounts_set_updated_at
before update on public.discounts
for each row execute function public.set_discounts_updated_at();

insert into public.discounts
  (name, code, type, value, min_spend, max_discount, total_limit, per_user_limit, applicable_users, is_first_purchase_only, stackable, status, active)
values
  ('新會員首購 $100', 'NEW100', 'amount', 100, 1000, null, 1000, 1, 'new', true, false, '啟用', true),
  ('首購 9 折', 'WELCOME10', 'percent', 10, 0, 300, 1000, 1, 'new', true, false, '啟用', true),
  ('滿 1500 折 150', '1500OFF150', 'amount', 150, 1500, null, 1000, 1, 'all', false, false, '啟用', true),
  ('VIP 專屬 $200', 'VIP200', 'amount', 200, 2000, null, 500, 1, 'vip', false, false, '草稿', false),
  ('全館免運券', 'FREESHIP', 'free_shipping', 0, 0, null, 1000, 1, 'all', false, false, '啟用', true),
  ('指定分類 9 折', 'CATEGORY10', 'percent', 10, 0, null, 1000, 1, 'all', false, false, '草稿', false)
on conflict (code) do nothing;
