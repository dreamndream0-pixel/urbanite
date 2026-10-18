-- =============================================================
-- 預約 E2:加購項目也能用票券
-- - 票券商品分「服務」或「加購」(scope);加購票券可指定適用的加購項目(空 = 全部加購)
-- - 一筆預約可同時用主服務票券 + 每個加購各一張票券(bk_bookings.addon_packages)
-- - 帳本多 addon_id 欄位,同一張票券在同一筆預約可分別扣主服務與加購
-- - 狀態同步:完成 → 扣次,取消 / 逾期 / 未到 → 退回,涵蓋這筆預約保留的所有票券
-- 需先執行 -c4、-d3。可重複執行。
-- =============================================================
begin;

alter table public.bk_package_products add column if not exists scope text not null default 'service';
alter table public.bk_package_products add column if not exists addon_ids uuid[] not null default '{}';
alter table public.bk_customer_packages add column if not exists scope text not null default 'service';
alter table public.bk_customer_packages add column if not exists addon_ids uuid[] not null default '{}';
do $$ begin
  alter table public.bk_package_products add constraint bk_package_products_scope_check check (scope in ('service', 'addon'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.bk_customer_packages add constraint bk_customer_packages_scope_check check (scope in ('service', 'addon'));
exception when duplicate_object then null; end $$;

alter table public.bk_package_ledger add column if not exists addon_id uuid;
drop index if exists public.bk_package_ledger_once;
create unique index if not exists bk_package_ledger_once2 on public.bk_package_ledger
  (package_id, booking_id, kind, coalesce(addon_id, '00000000-0000-0000-0000-000000000000'::uuid)) where booking_id is not null;

alter table public.bk_bookings add column if not exists addon_packages jsonb not null default '[]';

-- 主服務票券:只能用「服務」票券
create or replace function public.bk_package_reserve(p_package uuid, p_booking uuid, p_customer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pk public.bk_customer_packages;
  svc uuid;
begin
  select * into pk from public.bk_customer_packages where id = p_package for update;
  if not found or pk.customer_id is distinct from p_customer then raise exception 'PACKAGE_INVALID'; end if;
  if pk.status <> 'active' or pk.expires_at < now() or pk.scope <> 'service' then raise exception 'PACKAGE_INVALID'; end if;
  select service_id into svc from public.bk_bookings where id = p_booking;
  if cardinality(pk.service_ids) > 0 and not (svc = any(pk.service_ids)) then raise exception 'PACKAGE_INVALID'; end if;
  if public.bk_package_available(p_package) < 1 then raise exception 'PACKAGE_EMPTY'; end if;
  insert into public.bk_package_ledger (business_id, package_id, booking_id, kind, sessions) values (pk.business_id, pk.id, p_booking, 'reserve', -1);
end $$;
revoke all on function public.bk_package_reserve(uuid, uuid, uuid) from public, anon, authenticated;

-- 加購票券:這筆預約要有這個加購,票券要適用
create or replace function public.bk_package_reserve_addon(p_package uuid, p_booking uuid, p_customer uuid, p_addon uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pk public.bk_customer_packages;
  adds jsonb;
begin
  select * into pk from public.bk_customer_packages where id = p_package for update;
  if not found or pk.customer_id is distinct from p_customer then raise exception 'PACKAGE_INVALID'; end if;
  if pk.status <> 'active' or pk.expires_at < now() or pk.scope <> 'addon' then raise exception 'PACKAGE_INVALID'; end if;
  if cardinality(pk.addon_ids) > 0 and not (p_addon = any(pk.addon_ids)) then raise exception 'PACKAGE_INVALID'; end if;
  select addons into adds from public.bk_bookings where id = p_booking;
  if not exists (select 1 from jsonb_array_elements(coalesce(adds, '[]'::jsonb)) x where x->>'id' = p_addon::text) then raise exception 'PACKAGE_INVALID'; end if;
  if public.bk_package_available(p_package) < 1 then raise exception 'PACKAGE_EMPTY'; end if;
  insert into public.bk_package_ledger (business_id, package_id, booking_id, kind, sessions, addon_id) values (pk.business_id, pk.id, p_booking, 'reserve', -1, p_addon);
end $$;
revoke all on function public.bk_package_reserve_addon(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- 狀態同步:這筆預約保留的每一張票券(主服務 + 加購)各自扣次或退回
create or replace function public.bk_bookings_package_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.status = old.status then return new; end if;
  if new.status not in ('completed', 'cancelled', 'expired', 'no_show') then return new; end if;
  for r in select package_id, addon_id from public.bk_package_ledger where booking_id = new.id and kind = 'reserve' loop
    if new.status = 'completed' then
      insert into public.bk_package_ledger (business_id, package_id, booking_id, kind, sessions, addon_id) values (new.business_id, r.package_id, new.id, 'redeem', 0, r.addon_id)
      on conflict do nothing;
    elsif not exists (select 1 from public.bk_package_ledger where package_id = r.package_id and booking_id = new.id and kind = 'redeem' and addon_id is not distinct from r.addon_id) then
      insert into public.bk_package_ledger (business_id, package_id, booking_id, kind, sessions, addon_id) values (new.business_id, r.package_id, new.id, 'release', 1, r.addon_id)
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

-- 售出:帶入票券種類與適用加購
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
  insert into public.bk_customer_packages (business_id, customer_id, product_id, name, service_ids, sessions_total, price_paid, pay_method, expires_at, scope, addon_ids)
  values (p_business, p_customer, pr.id, pr.name, pr.service_ids, pr.sessions, p_price, p_method, now() + make_interval(days => pr.valid_days), pr.scope, pr.addon_ids)
  returning * into pk;
  insert into public.bk_package_ledger (business_id, package_id, kind, sessions, note) values (p_business, pk.id, 'purchase', pr.sessions, '售出');
  if p_points > 0 then
    insert into public.bk_reward_ledger (business_id, customer_id, kind, points, source, note)
    values (p_business, p_customer, 'earn', p_points, 'package:' || pk.id, '購買套票 ' || pr.name) on conflict do nothing;
  end if;
  return pk;
end $$;
revoke all on function public.bk_package_sell(uuid, uuid, uuid, integer, text, integer) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 建立預約 v2(E2):多了 p->'addon_packages'([{addon_id, package_id}],同一交易保留,次數不足整筆不成立)
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
      staff_id, staff_requested, resource_id, addons, total_price, deposit_amount, payment_status, created_by, quote_id, customer_id, package_id, branch_id, addon_packages)
    values (v_business, p->>'booking_no', v_customer, nullif(p->>'service_id', '')::uuid, p->'service_snapshot',
      (p->>'start_at')::timestamptz, (p->>'end_at')::timestamptz, (p->>'occupy_end_at')::timestamptz,
      p->>'status', p->>'approval_status', coalesce(p->'contact', '{}'::jsonb), nullif(p->>'source_card_id', '')::uuid,
      coalesce(nullif(p->>'source_channel', ''), 'card'), nullif(p->>'expires_at', '')::timestamptz, v_idem,
      (p->>'staff_id')::uuid, coalesce((p->>'staff_requested')::boolean, false), nullif(p->>'resource_id', '')::uuid,
      coalesce(p->'addons', '[]'::jsonb), coalesce((p->>'total_price')::int, 0), coalesce((p->>'deposit_amount')::int, 0),
      coalesce(nullif(p->>'payment_status', ''), 'none'), coalesce(nullif(p->>'created_by', ''), 'customer'), nullif(p->>'quote_id', '')::uuid, nullif(p->>'customer_id', '')::uuid, nullif(p->>'package_id', '')::uuid, nullif(p->>'branch_id', '')::uuid, coalesce(p->'addon_packages', '[]'::jsonb))
    returning * into created;
    perform public.bk_write_allocations(created, p->'allocations');
    perform public.bk_write_items(created, p->'items');
    if created.package_id is not null then perform public.bk_package_reserve(created.package_id, created.id, created.customer_id); end if;
    for n in select * from jsonb_array_elements(created.addon_packages) loop
      perform public.bk_package_reserve_addon((n->>'package_id')::uuid, created.id, created.customer_id, (n->>'addon_id')::uuid);
    end loop;
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

commit;
