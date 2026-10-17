-- =============================================================
-- URBANLINKS 預約系統 D3:多分店
-- - bk_branches:同一個商家的分店;沒有分店 = 單一據點(行為與之前相同)
-- - 營業時段、床位、休假可指定分店;人員班表每一段可指定在哪間分店;服務可限定分店
-- - 同一位人員前後兩筆在不同分店時,中間要留移動時間(branch_travel_minutes)
-- 需先執行過 migration-booking-d2.sql。可重複執行。
-- =============================================================

create table if not exists public.bk_branches (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  name         text not null,
  address      text not null default '',
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists bk_branches_business_idx on public.bk_branches (business_id, sort_order);
alter table public.bk_branches enable row level security;

alter table public.bk_businesses add column if not exists branch_travel_minutes integer not null default 30;
alter table public.bk_hours add column if not exists branch_id uuid references public.bk_branches(id) on delete cascade;
alter table public.bk_staff_hours add column if not exists branch_id uuid references public.bk_branches(id) on delete cascade;
alter table public.bk_resources add column if not exists branch_id uuid references public.bk_branches(id) on delete set null;
alter table public.bk_exceptions add column if not exists branch_id uuid references public.bk_branches(id) on delete cascade;
alter table public.bk_services add column if not exists branch_ids uuid[] not null default '{}';   -- 空 = 所有分店
alter table public.bk_bookings add column if not exists branch_id uuid references public.bk_branches(id) on delete set null;
create index if not exists bk_bookings_branch_idx on public.bk_bookings (branch_id, start_at) where branch_id is not null;

-- -------------------------------------------------------------
-- 建立預約 v2(D3):多了 p->>'branch_id'(分店)
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
      staff_id, staff_requested, resource_id, addons, total_price, deposit_amount, payment_status, created_by, quote_id, customer_id, package_id, branch_id)
    values (v_business, p->>'booking_no', v_customer, nullif(p->>'service_id', '')::uuid, p->'service_snapshot',
      (p->>'start_at')::timestamptz, (p->>'end_at')::timestamptz, (p->>'occupy_end_at')::timestamptz,
      p->>'status', p->>'approval_status', coalesce(p->'contact', '{}'::jsonb), nullif(p->>'source_card_id', '')::uuid,
      coalesce(nullif(p->>'source_channel', ''), 'card'), nullif(p->>'expires_at', '')::timestamptz, v_idem,
      (p->>'staff_id')::uuid, coalesce((p->>'staff_requested')::boolean, false), nullif(p->>'resource_id', '')::uuid,
      coalesce(p->'addons', '[]'::jsonb), coalesce((p->>'total_price')::int, 0), coalesce((p->>'deposit_amount')::int, 0),
      coalesce(nullif(p->>'payment_status', ''), 'none'), coalesce(nullif(p->>'created_by', ''), 'customer'), nullif(p->>'quote_id', '')::uuid, nullif(p->>'customer_id', '')::uuid, nullif(p->>'package_id', '')::uuid, nullif(p->>'branch_id', '')::uuid)
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

