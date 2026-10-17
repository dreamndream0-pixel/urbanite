-- =============================================================
-- URBANLINKS 預約系統 C1:分段占用(美髮上藥 / 等待 / 沖洗 / 吹整、助理)
-- - 每筆預約的占用改存在 bk_allocations(人員或座位各一段或多段)
-- - 防重複約束從 bk_bookings 搬到 bk_allocations;沒有步驟的服務仍是一整段(行為同 B 階段)
-- - 建立 / 改期的 RPC 可帶入明確的區段;沒帶時依預約時間自動建立一整段(舊程式也安全)
-- 需先執行過 migration-booking.sql、migration-booking-b.sql。可重複執行。
-- =============================================================

-- 人員角色:設計師(可接主要服務)/ 助理(只接助理步驟)
alter table public.bk_staff add column if not exists role text not null default 'stylist';
do $$ begin
  alter table public.bk_staff add constraint bk_staff_role_check check (role in ('stylist', 'assistant'));
exception when duplicate_object or duplicate_table then null; end $$;

-- 服務步驟(沒有步驟 = 整段由同一位人員完成)
create table if not exists public.bk_service_steps (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  service_id   uuid not null references public.bk_services(id) on delete cascade,
  seq          integer not null default 0,
  name         text not null,
  minutes      integer not null check (minutes between 5 and 480),
  who          text not null default 'main' check (who in ('main', 'assistant', 'none')),   -- 主要人員 / 助理 / 不需人員(等待)
  seat         text not null default 'keep' check (seat in ('keep', 'release'))            -- 這段是否占用座位
);
create index if not exists bk_service_steps_service_idx on public.bk_service_steps (service_id, seq);
alter table public.bk_service_steps enable row level security;

-- 占用區段:人員或座位二擇一
create table if not exists public.bk_allocations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  booking_id   uuid not null references public.bk_bookings(id) on delete cascade,
  staff_id     uuid references public.bk_staff(id) on delete restrict,
  resource_id  uuid references public.bk_resources(id) on delete cascade,
  role         text not null default 'main' check (role in ('main', 'assistant', 'seat')),
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  active       boolean not null default true,
  check (end_at > start_at),
  check ((staff_id is null) <> (resource_id is null))
);
create index if not exists bk_allocations_booking_idx on public.bk_allocations (booking_id);
create index if not exists bk_allocations_business_idx on public.bk_allocations (business_id, start_at) where active;
alter table public.bk_allocations enable row level security;

do $$ begin
  alter table public.bk_allocations add constraint bk_alloc_staff_no_overlap
    exclude using gist (staff_id with =, tstzrange(start_at, end_at, '[)') with &&) where (active and staff_id is not null);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.bk_allocations add constraint bk_alloc_resource_no_overlap
    exclude using gist (resource_id with =, tstzrange(start_at, end_at, '[)') with &&) where (active and resource_id is not null);
exception when duplicate_object or duplicate_table then null; end $$;

-- 既有的有效預約補一整段占用(只補還沒有區段的)
insert into public.bk_allocations (business_id, booking_id, staff_id, role, start_at, end_at, active)
select b.business_id, b.id, b.staff_id, 'main', b.start_at, b.occupy_end_at, true
  from public.bk_bookings b
 where b.staff_id is not null and b.status in ('pending', 'confirmed', 'checked_in')
   and not exists (select 1 from public.bk_allocations a where a.booking_id = b.id);
insert into public.bk_allocations (business_id, booking_id, resource_id, role, start_at, end_at, active)
select b.business_id, b.id, b.resource_id, 'seat', b.start_at, b.occupy_end_at, true
  from public.bk_bookings b
 where b.resource_id is not null and b.status in ('pending', 'confirmed', 'checked_in')
   and not exists (select 1 from public.bk_allocations a where a.booking_id = b.id and a.resource_id is not null);

-- 寫入一筆預約的區段:p_allocs 為空時依預約時間建立一整段(人員 + 座位)
create or replace function public.bk_write_allocations(b public.bk_bookings, p_allocs jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a jsonb;
begin
  delete from public.bk_allocations where booking_id = b.id;
  if b.status not in ('pending', 'confirmed', 'checked_in') then return; end if;
  if p_allocs is null or jsonb_array_length(p_allocs) = 0 then
    if b.staff_id is not null then
      insert into public.bk_allocations (business_id, booking_id, staff_id, role, start_at, end_at)
      values (b.business_id, b.id, b.staff_id, 'main', b.start_at, b.occupy_end_at);
    end if;
    if b.resource_id is not null then
      insert into public.bk_allocations (business_id, booking_id, resource_id, role, start_at, end_at)
      values (b.business_id, b.id, b.resource_id, 'seat', b.start_at, b.occupy_end_at);
    end if;
    return;
  end if;
  for a in select * from jsonb_array_elements(p_allocs) loop
    insert into public.bk_allocations (business_id, booking_id, staff_id, resource_id, role, start_at, end_at)
    values (b.business_id, b.id, nullif(a->>'staff_id', '')::uuid, nullif(a->>'resource_id', '')::uuid,
            coalesce(a->>'role', 'main'), (a->>'start_at')::timestamptz, (a->>'end_at')::timestamptz);
  end loop;
end $$;
revoke all on function public.bk_write_allocations(public.bk_bookings, jsonb) from public, anon, authenticated;

-- 沒經過 RPC 直接新增的預約(舊程式)也自動建立一整段占用
create or replace function public.bk_bookings_default_alloc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('bk.explicit_alloc', true), '') <> '1' then
    perform public.bk_write_allocations(new, null);
  end if;
  return new;
end $$;
drop trigger if exists bk_bookings_default_alloc on public.bk_bookings;
create trigger bk_bookings_default_alloc after insert on public.bk_bookings
  for each row execute function public.bk_bookings_default_alloc();

-- 預約變成取消 / 完成 / 未到 / 逾期時,占用跟著失效
create or replace function public.bk_bookings_sync_alloc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.bk_allocations
     set active = (new.status in ('pending', 'confirmed', 'checked_in'))
   where booking_id = new.id and active is distinct from (new.status in ('pending', 'confirmed', 'checked_in'));
  return new;
end $$;
drop trigger if exists bk_bookings_sync_alloc on public.bk_bookings;
create trigger bk_bookings_sync_alloc after update of status on public.bk_bookings
  for each row execute function public.bk_bookings_sync_alloc();

-- -------------------------------------------------------------
-- 建立預約 v2:多了 p->'allocations'(明確的分段占用),任一段衝突整筆不成立
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

  -- 逾期未確認 / 未付訂金的預約先釋放(不只靠排程;占用由 trigger 一起失效)
  update public.bk_bookings
     set status = 'expired', approval_status = case when approval_status = 'pending' then 'rejected' else approval_status end,
         version = version + 1, updated_at = now()
   where business_id = v_business and status = 'pending' and expires_at is not null and expires_at < now();

  perform set_config('bk.explicit_alloc', '1', true);
  begin
    insert into public.bk_bookings (business_id, booking_no, customer_user_id, service_id, service_snapshot, start_at, end_at, occupy_end_at,
      status, approval_status, contact, source_card_id, source_channel, expires_at, idempotency_key,
      staff_id, staff_requested, resource_id, addons, total_price, deposit_amount, payment_status, created_by)
    values (v_business, p->>'booking_no', v_customer, nullif(p->>'service_id', '')::uuid, p->'service_snapshot',
      (p->>'start_at')::timestamptz, (p->>'end_at')::timestamptz, (p->>'occupy_end_at')::timestamptz,
      p->>'status', p->>'approval_status', coalesce(p->'contact', '{}'::jsonb), nullif(p->>'source_card_id', '')::uuid,
      coalesce(nullif(p->>'source_channel', ''), 'card'), nullif(p->>'expires_at', '')::timestamptz, v_idem,
      (p->>'staff_id')::uuid, coalesce((p->>'staff_requested')::boolean, false), nullif(p->>'resource_id', '')::uuid,
      coalesce(p->'addons', '[]'::jsonb), coalesce((p->>'total_price')::int, 0), coalesce((p->>'deposit_amount')::int, 0),
      coalesce(nullif(p->>'payment_status', ''), 'none'), coalesce(nullif(p->>'created_by', ''), 'customer'))
    returning * into created;
    perform public.bk_write_allocations(created, p->'allocations');
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

-- -------------------------------------------------------------
-- 改期:同一交易替換全部區段;新區段衝突時整筆不變(原預約與原占用仍有效)
-- -------------------------------------------------------------
drop function if exists public.bk_reschedule(uuid, integer, uuid, uuid, timestamptz, timestamptz, timestamptz, text, uuid, boolean, jsonb);
create or replace function public.bk_reschedule(
  p_booking_id uuid, p_expected_version integer, p_staff uuid, p_resource uuid,
  p_start timestamptz, p_end timestamptz, p_occupy_end timestamptz,
  p_actor_type text, p_actor uuid, p_count boolean, p_notices jsonb, p_allocations jsonb default null
) returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bk_bookings;
  old public.bk_bookings;
  n jsonb;
begin
  select * into old from public.bk_bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and old.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if old.status not in ('pending', 'confirmed') then raise exception 'INVALID_STATE'; end if;
  if old.start_at <= now() then raise exception 'INVALID_STATE'; end if;

  begin
    update public.bk_bookings
       set staff_id = p_staff, resource_id = p_resource, start_at = p_start, end_at = p_end, occupy_end_at = p_occupy_end,
           reschedule_count = reschedule_count + case when p_count then 1 else 0 end,
           version = version + 1, updated_at = now()
     where id = p_booking_id
     returning * into b;
    perform public.bk_write_allocations(b, p_allocations);
  exception when exclusion_violation then raise exception 'SLOT_UNAVAILABLE';
  end;

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (b.id, b.business_id, b.version, 'rescheduled', p_actor_type, p_actor, jsonb_build_object(
    'from', jsonb_build_object('start_at', old.start_at, 'staff_id', old.staff_id),
    'to', jsonb_build_object('start_at', b.start_at, 'staff_id', b.staff_id)));

  for n in select * from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) loop
    insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience, due_at)
    values (b.business_id, b.id, b.version, n->>'event', n->>'audience', coalesce((n->>'due_at')::timestamptz, now()))
    on conflict do nothing;
  end loop;
  return b;
end $$;
revoke all on function public.bk_reschedule(uuid, integer, uuid, uuid, timestamptz, timestamptz, timestamptz, text, uuid, boolean, jsonb, jsonb) from public, anon, authenticated;

-- 防重複改由占用區段負責(分段預約的整體時間可以和別人重疊,例如等待時插單)
alter table public.bk_bookings drop constraint if exists bk_bookings_staff_no_overlap;
alter table public.bk_bookings drop constraint if exists bk_bookings_resource_no_overlap;
