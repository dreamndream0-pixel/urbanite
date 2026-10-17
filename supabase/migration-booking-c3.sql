-- =============================================================
-- URBANLINKS 預約系統 C3:顧客檔案、服務紀錄、私人照片、作品公開同意
-- - bk_customers:每間店各自的顧客檔案(不跨店共用);線上預約依帳號自動建檔,不依手機號碼合併
-- - bk_service_records:服務紀錄(配方、備註)+ 公開同意狀態;bk_attachments:前後照片(私人空間 booking-private)
-- 需先執行過 migration-booking-c2.sql。可重複執行。
-- =============================================================

create table if not exists public.bk_customers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  user_id      uuid,                                  -- 有帳號的顧客(線上預約);電話客為空
  name         text not null default '',
  phone        text not null default '',
  note         text not null default '',              -- 偏好與注意事項(只有店家看得到)
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists bk_customers_user_unique on public.bk_customers (business_id, user_id) where user_id is not null;
create index if not exists bk_customers_business_idx on public.bk_customers (business_id, updated_at desc);
alter table public.bk_customers enable row level security;

alter table public.bk_bookings add column if not exists customer_id uuid references public.bk_customers(id) on delete set null;
alter table public.bk_quotes add column if not exists customer_id uuid references public.bk_customers(id) on delete set null;

create table if not exists public.bk_service_records (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.bk_businesses(id) on delete cascade,
  customer_id       uuid not null references public.bk_customers(id) on delete cascade,
  booking_id        uuid references public.bk_bookings(id) on delete set null,
  staff_id          uuid references public.bk_staff(id) on delete set null,
  service_name      text not null default '',
  performed_on      date not null default (now() at time zone 'Asia/Taipei')::date,
  content           text not null default '',          -- 配方、施作紀錄
  consent           text not null default 'none' check (consent in ('none', 'requested', 'granted', 'declined', 'revoked')),
  consent_at        timestamptz,
  delete_requested  boolean not null default false,     -- 顧客要求刪除照片
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists bk_service_records_customer_idx on public.bk_service_records (customer_id, performed_on desc);
alter table public.bk_service_records enable row level security;

create table if not exists public.bk_attachments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  customer_id  uuid not null references public.bk_customers(id) on delete cascade,
  record_id    uuid not null references public.bk_service_records(id) on delete cascade,
  path         text not null,
  kind         text not null default 'after' check (kind in ('before', 'after', 'other')),
  created_at   timestamptz not null default now()
);
create index if not exists bk_attachments_record_idx on public.bk_attachments (record_id, created_at);
alter table public.bk_attachments enable row level security;

-- 通知可以屬於服務紀錄(請顧客同意公開、顧客要求刪除照片)
alter table public.bk_notification_outbox add column if not exists record_id uuid references public.bk_service_records(id) on delete cascade;
create unique index if not exists bk_outbox_record_unique on public.bk_notification_outbox (record_id, event, audience, channel, booking_version) where record_id is not null;

-- 預約自動建顧客檔:有帳號 → 依 (店, 帳號) 找或建;沒帳號(電話客)且沒指定 → 建新檔
create or replace function public.bk_bookings_customer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if new.customer_id is not null then return new; end if;
  if new.customer_user_id is not null then
    select id into cid from public.bk_customers where business_id = new.business_id and user_id = new.customer_user_id;
    if cid is null then
      insert into public.bk_customers (business_id, user_id, name, phone)
      values (new.business_id, new.customer_user_id, coalesce(new.contact->>'name', ''), coalesce(new.contact->>'phone', ''))
      on conflict (business_id, user_id) where user_id is not null do update set updated_at = now()
      returning id into cid;
    else
      update public.bk_customers set updated_at = now(),
             phone = case when phone = '' then coalesce(new.contact->>'phone', '') else phone end,
             name = case when name = '' then coalesce(new.contact->>'name', '') else name end
       where id = cid;
    end if;
  else
    insert into public.bk_customers (business_id, name, phone)
    values (new.business_id, coalesce(new.contact->>'name', ''), coalesce(new.contact->>'phone', ''))
    returning id into cid;
  end if;
  new.customer_id := cid;
  return new;
end $$;
drop trigger if exists bk_bookings_customer on public.bk_bookings;
create trigger bk_bookings_customer before insert on public.bk_bookings
  for each row execute function public.bk_bookings_customer();

-- 既有預約補建顧客檔(有帳號的依帳號合併;電話客每筆各自一檔)
insert into public.bk_customers (business_id, user_id, name, phone)
select distinct on (b.business_id, b.customer_user_id) b.business_id, b.customer_user_id, coalesce(b.contact->>'name', ''), coalesce(b.contact->>'phone', '')
  from public.bk_bookings b
 where b.customer_user_id is not null and b.customer_id is null
   and not exists (select 1 from public.bk_customers c where c.business_id = b.business_id and c.user_id = b.customer_user_id)
 order by b.business_id, b.customer_user_id, b.created_at desc;
update public.bk_bookings b set customer_id = c.id
  from public.bk_customers c
 where b.customer_id is null and b.customer_user_id is not null and c.business_id = b.business_id and c.user_id = b.customer_user_id;

-- -------------------------------------------------------------
-- 建立預約 v2(C3):多了 p->>'customer_id'(店家人工加單選既有顧客);沒帶時由 trigger 自動建檔
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
      staff_id, staff_requested, resource_id, addons, total_price, deposit_amount, payment_status, created_by, quote_id, customer_id)
    values (v_business, p->>'booking_no', v_customer, nullif(p->>'service_id', '')::uuid, p->'service_snapshot',
      (p->>'start_at')::timestamptz, (p->>'end_at')::timestamptz, (p->>'occupy_end_at')::timestamptz,
      p->>'status', p->>'approval_status', coalesce(p->'contact', '{}'::jsonb), nullif(p->>'source_card_id', '')::uuid,
      coalesce(nullif(p->>'source_channel', ''), 'card'), nullif(p->>'expires_at', '')::timestamptz, v_idem,
      (p->>'staff_id')::uuid, coalesce((p->>'staff_requested')::boolean, false), nullif(p->>'resource_id', '')::uuid,
      coalesce(p->'addons', '[]'::jsonb), coalesce((p->>'total_price')::int, 0), coalesce((p->>'deposit_amount')::int, 0),
      coalesce(nullif(p->>'payment_status', ''), 'none'), coalesce(nullif(p->>'created_by', ''), 'customer'), nullif(p->>'quote_id', '')::uuid, nullif(p->>'customer_id', '')::uuid)
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

