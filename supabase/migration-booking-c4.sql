-- =============================================================
-- URBANLINKS 預約系統 C4:套票(次數帳本)與回饋點數(點數帳本)
-- - 套票:店家後台現場售出;預約時保留 1 次、完成扣次、取消 / 逾期 / 未到退回;帳本追加式,餘額由帳本算出
-- - 回饋點數:服務完成且付清後依實收入帳(同一來源只入帳一次),可折抵,退款沖銷;套票在購買時入帳
-- 需先執行過 migration-booking-c3.sql。可重複執行。
-- =============================================================

create table if not exists public.bk_package_products (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  name         text not null,
  service_ids  uuid[] not null default '{}',     -- 可兌換的服務
  sessions     integer not null check (sessions between 1 and 100),
  price        integer not null default 0 check (price >= 0),
  valid_days   integer not null default 365 check (valid_days between 1 and 3650),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.bk_package_products enable row level security;

create table if not exists public.bk_customer_packages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.bk_businesses(id) on delete cascade,
  customer_id     uuid not null references public.bk_customers(id) on delete cascade,
  product_id      uuid references public.bk_package_products(id) on delete set null,
  name            text not null,
  service_ids     uuid[] not null default '{}',
  sessions_total  integer not null check (sessions_total > 0),
  price_paid      integer not null default 0,
  pay_method      text not null default 'cash',
  expires_at      timestamptz not null,
  status          text not null default 'active' check (status in ('active', 'refunded')),
  created_at      timestamptz not null default now()
);
create index if not exists bk_customer_packages_customer_idx on public.bk_customer_packages (customer_id, created_at desc);
alter table public.bk_customer_packages enable row level security;

-- 次數帳本:purchase +N、reserve −1、release +1(取消退回)、redeem 0(保留轉為已用)、refund / expire −剩餘
create table if not exists public.bk_package_ledger (
  id           bigserial primary key,
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  package_id   uuid not null references public.bk_customer_packages(id) on delete cascade,
  booking_id   uuid references public.bk_bookings(id) on delete set null,
  kind         text not null check (kind in ('purchase', 'reserve', 'release', 'redeem', 'refund', 'expire')),
  sessions     integer not null,
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create unique index if not exists bk_package_ledger_once on public.bk_package_ledger (package_id, booking_id, kind) where booking_id is not null;
create index if not exists bk_package_ledger_pkg_idx on public.bk_package_ledger (package_id, id);
alter table public.bk_package_ledger enable row level security;

alter table public.bk_bookings add column if not exists package_id uuid references public.bk_customer_packages(id) on delete set null;

-- 可用次數 = 帳本加總(購買 − 保留 + 退回 − 退款 / 到期)
create or replace function public.bk_package_available(p_package uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(sessions), 0)::int from public.bk_package_ledger where package_id = p_package
$$;

-- 預約時保留 1 次(鎖住套票,檢查有效期、適用服務、可用次數)
create or replace function public.bk_package_reserve(p_package uuid, p_booking uuid, p_customer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pk public.bk_customer_packages;
  svc uuid;
begin
  select * into pk from public.bk_customer_packages where id = p_package for update;
  if not found or pk.customer_id is distinct from p_customer then raise exception 'PACKAGE_INVALID'; end if;
  if pk.status <> 'active' or pk.expires_at < now() then raise exception 'PACKAGE_INVALID'; end if;
  select service_id into svc from public.bk_bookings where id = p_booking;
  if cardinality(pk.service_ids) > 0 and not (svc = any(pk.service_ids)) then raise exception 'PACKAGE_INVALID'; end if;
  if public.bk_package_available(p_package) < 1 then raise exception 'PACKAGE_EMPTY'; end if;
  insert into public.bk_package_ledger (business_id, package_id, booking_id, kind, sessions) values (pk.business_id, pk.id, p_booking, 'reserve', -1);
end $$;
revoke all on function public.bk_package_reserve(uuid, uuid, uuid) from public, anon, authenticated;

-- 預約狀態改變時自動處理套票:完成 → 扣次;取消 / 逾期 / 未到 → 退回(各只做一次)
create or replace function public.bk_bookings_package_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.package_id is null or new.status = old.status then return new; end if;
  if not exists (select 1 from public.bk_package_ledger where package_id = new.package_id and booking_id = new.id and kind = 'reserve') then return new; end if;
  if new.status = 'completed' then
    insert into public.bk_package_ledger (business_id, package_id, booking_id, kind, sessions) values (new.business_id, new.package_id, new.id, 'redeem', 0)
    on conflict do nothing;
  elsif new.status in ('cancelled', 'expired', 'no_show') then
    if not exists (select 1 from public.bk_package_ledger where package_id = new.package_id and booking_id = new.id and kind = 'redeem') then
      insert into public.bk_package_ledger (business_id, package_id, booking_id, kind, sessions) values (new.business_id, new.package_id, new.id, 'release', 1)
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bk_bookings_package_sync on public.bk_bookings;
create trigger bk_bookings_package_sync after update of status on public.bk_bookings
  for each row execute function public.bk_bookings_package_sync();

-- 售出套票(單一交易:套票 + 購買帳本 + 購買回饋)
create or replace function public.bk_package_sell(p_business uuid, p_customer uuid, p_product uuid, p_price integer, p_method text, p_points integer)
returns public.bk_customer_packages
language plpgsql security definer set search_path = public as $$
declare
  pr public.bk_package_products;
  pk public.bk_customer_packages;
begin
  select * into pr from public.bk_package_products where id = p_product and business_id = p_business and active;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.bk_customers where id = p_customer and business_id = p_business) then raise exception 'NOT_FOUND'; end if;
  insert into public.bk_customer_packages (business_id, customer_id, product_id, name, service_ids, sessions_total, price_paid, pay_method, expires_at)
  values (p_business, p_customer, pr.id, pr.name, pr.service_ids, pr.sessions, p_price, p_method, now() + make_interval(days => pr.valid_days))
  returning * into pk;
  insert into public.bk_package_ledger (business_id, package_id, kind, sessions, note) values (p_business, pk.id, 'purchase', pr.sessions, '售出');
  if p_points > 0 then
    insert into public.bk_reward_ledger (business_id, customer_id, kind, points, source, note)
    values (p_business, p_customer, 'earn', p_points, 'package:' || pk.id, '購買套票 ' || pr.name) on conflict do nothing;
  end if;
  return pk;
end $$;
revoke all on function public.bk_package_sell(uuid, uuid, uuid, integer, text, integer) from public, anon, authenticated;

-- 套票退款:剩餘次數歸零(保留中的預約仍可完成)
create or replace function public.bk_package_refund(p_package uuid, p_business uuid, p_note text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  pk public.bk_customer_packages;
  left_n integer;
begin
  select * into pk from public.bk_customer_packages where id = p_package and business_id = p_business for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if pk.status <> 'active' then raise exception 'INVALID_STATE'; end if;
  left_n := public.bk_package_available(pk.id);
  if left_n > 0 then
    insert into public.bk_package_ledger (business_id, package_id, kind, sessions, note) values (p_business, pk.id, 'refund', -left_n, coalesce(p_note, ''));
  end if;
  update public.bk_customer_packages set status = 'refunded' where id = pk.id;
  return left_n;
end $$;
revoke all on function public.bk_package_refund(uuid, uuid, text) from public, anon, authenticated;

-- 回饋點數
alter table public.bk_businesses add column if not exists reward_enabled boolean not null default false;
alter table public.bk_businesses add column if not exists reward_rate integer not null default 100;      -- 每多少元 1 點
alter table public.bk_businesses add column if not exists point_value integer not null default 1;        -- 1 點折抵幾元
alter table public.bk_businesses add column if not exists reward_expire_days integer not null default 365;

create table if not exists public.bk_reward_ledger (
  id           bigserial primary key,
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  customer_id  uuid not null references public.bk_customers(id) on delete cascade,
  booking_id   uuid references public.bk_bookings(id) on delete set null,
  kind         text not null check (kind in ('earn', 'redeem', 'reverse', 'expire', 'adjust')),
  points       integer not null,
  source       text not null,                       -- 同一來源只入帳一次(例:booking:<id>:earn)
  note         text not null default '',
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists bk_reward_ledger_source on public.bk_reward_ledger (business_id, source);
create index if not exists bk_reward_ledger_customer_idx on public.bk_reward_ledger (customer_id, id);
alter table public.bk_reward_ledger enable row level security;

-- 收款方式多一個「點數折抵」
alter table public.bk_payments drop constraint if exists bk_payments_method_check;
alter table public.bk_payments add constraint bk_payments_method_check check (method in ('transfer', 'cash', 'card', 'other', 'points', 'package'));

-- -------------------------------------------------------------
-- 建立預約 v2(C4):多了 p->>'package_id'(使用套票:同一交易保留 1 次,次數不足整筆不成立)
-- -------------------------------------------------------------
create or replace function public.bk_create_booking2(p jsonb, p_notices jsonb)
returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  existing public.bk_bookings;
  created public.bk_bookings;
  v_customer uuid := nullif(p->>'customer_user_id', '')::uuid;
  v_idem text := nullif(p->>'idempotency_key', '');
  v_business uuid := (p->>'business_id')::uuid;
  n jsonb;
begin
  if v_idem is not null and v_customer is not null then
    select * into existing from public.bk_bookings where customer_user_id = v_customer and idempotency_key = v_idem;
    if found then return existing; end if;
  end if;

  update public.bk_bookings
     set status = 'expired', approval_status = case when approval_status = 'pending' then 'rejected' else approval_status end,
         version = version + 1, updated_at = now()
   where business_id = v_business and status = 'pending' and expires_at is not null and expires_at < now();

  perform set_config('bk.explicit_alloc', '1', true);
  begin
    insert into public.bk_bookings (business_id, booking_no, customer_user_id, service_id, service_snapshot, start_at, end_at, occupy_end_at,
      status, approval_status, contact, source_card_id, source_channel, expires_at, idempotency_key,
      staff_id, staff_requested, resource_id, addons, total_price, deposit_amount, payment_status, created_by, quote_id, customer_id, package_id)
    values (v_business, p->>'booking_no', v_customer, nullif(p->>'service_id', '')::uuid, p->'service_snapshot',
      (p->>'start_at')::timestamptz, (p->>'end_at')::timestamptz, (p->>'occupy_end_at')::timestamptz,
      p->>'status', p->>'approval_status', coalesce(p->'contact', '{}'::jsonb), nullif(p->>'source_card_id', '')::uuid,
      coalesce(nullif(p->>'source_channel', ''), 'card'), nullif(p->>'expires_at', '')::timestamptz, v_idem,
      (p->>'staff_id')::uuid, coalesce((p->>'staff_requested')::boolean, false), nullif(p->>'resource_id', '')::uuid,
      coalesce(p->'addons', '[]'::jsonb), coalesce((p->>'total_price')::int, 0), coalesce((p->>'deposit_amount')::int, 0),
      coalesce(nullif(p->>'payment_status', ''), 'none'), coalesce(nullif(p->>'created_by', ''), 'customer'), nullif(p->>'quote_id', '')::uuid, nullif(p->>'customer_id', '')::uuid, nullif(p->>'package_id', '')::uuid)
    returning * into created;
    perform public.bk_write_allocations(created, p->'allocations');
    perform public.bk_write_items(created, p->'items');
    if created.package_id is not null then perform public.bk_package_reserve(created.package_id, created.id, created.customer_id); end if;
  exception
    when exclusion_violation then perform set_config('bk.explicit_alloc', '', true); raise exception 'SLOT_UNAVAILABLE';
    when unique_violation then
      perform set_config('bk.explicit_alloc', '', true);
      if v_idem is not null and v_customer is not null then
        select * into existing from public.bk_bookings where customer_user_id = v_customer and idempotency_key = v_idem;
        if found then return existing; end if;
      end if;
      raise;
  end;
  perform set_config('bk.explicit_alloc', '', true);

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (created.id, v_business, 1, 'created', coalesce(p->>'actor_type', 'customer'), nullif(p->>'actor_id', '')::uuid,
          jsonb_build_object('status', created.status, 'staff_id', created.staff_id));

  for n in select * from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) loop
    insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience, due_at)
    values (v_business, created.id, 1, n->>'event', n->>'audience', coalesce((n->>'due_at')::timestamptz, now()))
    on conflict do nothing;
  end loop;
  return created;
end $$;
revoke all on function public.bk_create_booking2(jsonb, jsonb) from public, anon, authenticated;

