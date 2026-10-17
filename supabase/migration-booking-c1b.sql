-- =============================================================
-- URBANLINKS 預約系統 C1b:一次預約多項服務(依序進行,可由不同人員接手)
-- - bk_booking_items:同一筆預約裡的每一項服務(各自的人員、時間、金額、狀態)
-- - bk_allocations.item_seq:占用屬於哪一項,部分取消時只釋放那一項
-- 需先執行過 migration-booking-c1.sql。可重複執行。
-- =============================================================

create table if not exists public.bk_booking_items (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.bk_businesses(id) on delete cascade,
  booking_id        uuid not null references public.bk_bookings(id) on delete cascade,
  seq               integer not null,
  service_id        uuid references public.bk_services(id) on delete set null,
  service_snapshot  jsonb not null,
  staff_id          uuid references public.bk_staff(id) on delete restrict,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  amount            integer not null default 0,
  status            text not null default 'active' check (status in ('active', 'cancelled')),
  unique (booking_id, seq)
);
create index if not exists bk_booking_items_booking_idx on public.bk_booking_items (booking_id, seq);
alter table public.bk_booking_items enable row level security;

alter table public.bk_allocations add column if not exists item_seq integer not null default 0;

-- 寫入區段:多了 item_seq
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
    insert into public.bk_allocations (business_id, booking_id, staff_id, resource_id, role, start_at, end_at, item_seq)
    values (b.business_id, b.id, nullif(a->>'staff_id', '')::uuid, nullif(a->>'resource_id', '')::uuid,
            coalesce(a->>'role', 'main'), (a->>'start_at')::timestamptz, (a->>'end_at')::timestamptz, coalesce((a->>'item_seq')::int, 0));
  end loop;
end $$;
revoke all on function public.bk_write_allocations(public.bk_bookings, jsonb) from public, anon, authenticated;

-- 寫入服務項目(只替換仍有效的項目;已取消的項目保留紀錄)
create or replace function public.bk_write_items(b public.bk_bookings, p_items jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then return; end if;
  delete from public.bk_booking_items where booking_id = b.id and status = 'active';
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.bk_booking_items (business_id, booking_id, seq, service_id, service_snapshot, staff_id, start_at, end_at, amount)
    values (b.business_id, b.id, (it->>'seq')::int, nullif(it->>'service_id', '')::uuid, it->'service_snapshot',
            nullif(it->>'staff_id', '')::uuid, (it->>'start_at')::timestamptz, (it->>'end_at')::timestamptz, coalesce((it->>'amount')::int, 0));
  end loop;
end $$;
revoke all on function public.bk_write_items(public.bk_bookings, jsonb) from public, anon, authenticated;

-- 狀態同步:只在預約變成無效時讓占用失效(不會把已取消項目的占用重新打開)
create or replace function public.bk_bookings_sync_alloc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('pending', 'confirmed', 'checked_in') then
    update public.bk_allocations set active = false where booking_id = new.id and active;
  end if;
  return new;
end $$;

-- -------------------------------------------------------------
-- 建立預約 v2:多了 p->'items'
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
    perform public.bk_write_items(created, p->'items');
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
-- 改期:多了 p_items(多項服務的新時間與人員)
-- -------------------------------------------------------------
drop function if exists public.bk_reschedule(uuid, integer, uuid, uuid, timestamptz, timestamptz, timestamptz, text, uuid, boolean, jsonb, jsonb);
create or replace function public.bk_reschedule(
  p_booking_id uuid, p_expected_version integer, p_staff uuid, p_resource uuid,
  p_start timestamptz, p_end timestamptz, p_occupy_end timestamptz,
  p_actor_type text, p_actor uuid, p_count boolean, p_notices jsonb, p_allocations jsonb default null, p_items jsonb default null
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
    perform public.bk_write_items(b, p_items);
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
revoke all on function public.bk_reschedule(uuid, integer, uuid, uuid, timestamptz, timestamptz, timestamptz, text, uuid, boolean, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 取消多項服務中的一項:只釋放那一項的占用並重算總額;剩最後一項時不能用這個(改取消整筆)
-- -------------------------------------------------------------
create or replace function public.bk_cancel_item(p_booking_id uuid, p_expected_version integer, p_seq integer, p_reason text, p_actor_type text, p_actor uuid, p_notices jsonb)
returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bk_bookings;
  it public.bk_booking_items;
  remaining integer;
  n jsonb;
begin
  select * into b from public.bk_bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if b.status not in ('pending', 'confirmed', 'checked_in') then raise exception 'INVALID_STATE'; end if;
  select * into it from public.bk_booking_items where booking_id = b.id and seq = p_seq and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select count(*) into remaining from public.bk_booking_items where booking_id = b.id and status = 'active';
  if remaining <= 1 then raise exception 'INVALID_STATE'; end if;

  update public.bk_booking_items set status = 'cancelled' where id = it.id;
  update public.bk_allocations set active = false where booking_id = b.id and item_seq = p_seq;
  update public.bk_bookings
     set total_price = greatest(0, total_price - it.amount),
         service_snapshot = service_snapshot || jsonb_build_object('name', (
           select string_agg(service_snapshot->>'name', ' + ' order by seq) from public.bk_booking_items where booking_id = b.id and status = 'active')),
         version = version + 1, updated_at = now()
   where id = b.id
   returning * into b;

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (b.id, b.business_id, b.version, 'item_cancelled', p_actor_type, p_actor,
          jsonb_build_object('seq', p_seq, 'service', it.service_snapshot->>'name', 'amount', it.amount, 'reason', coalesce(p_reason, '')));
  for n in select * from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) loop
    insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience, due_at)
    values (b.business_id, b.id, b.version, n->>'event', n->>'audience', coalesce((n->>'due_at')::timestamptz, now()))
    on conflict do nothing;
  end loop;
  return b;
end $$;
revoke all on function public.bk_cancel_item(uuid, integer, integer, text, text, uuid, jsonb) from public, anon, authenticated;
