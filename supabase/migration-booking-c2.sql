-- =============================================================
-- URBANLINKS 預約系統 C2:新秘 / 客製服務的詢價、報價、外出與整天檔期
-- - 需報價服務:顧客先詢價(不占檔期)→ 店家報價(有版本、有效期、可暫保留檔期)→ 顧客接受 → 訂金 / 成立
-- - 外出服務:前後自動加上交通時間(商家預設,報價時可改)
-- - 參考圖放私人儲存空間 booking-private,只有顧客本人與店家能看
-- 需先執行過 migration-booking-c1b.sql。可重複執行。
-- =============================================================

alter table public.bk_services add column if not exists price_mode text not null default 'fixed';
alter table public.bk_services add column if not exists service_mode text not null default 'in_store';
do $$ begin
  alter table public.bk_services add constraint bk_services_price_mode_check check (price_mode in ('fixed', 'quote'));
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.bk_services add constraint bk_services_service_mode_check check (service_mode in ('in_store', 'outcall'));
exception when duplicate_object or duplicate_table then null; end $$;

alter table public.bk_businesses add column if not exists travel_minutes integer not null default 60;   -- 外出服務前後交通時間(預設)
alter table public.bk_businesses add column if not exists service_area text not null default '';       -- 外出服務範圍說明

-- 詢價單
create table if not exists public.bk_quotes (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.bk_businesses(id) on delete cascade,
  quote_no          text not null unique,
  customer_user_id  uuid not null,
  service_id        uuid references public.bk_services(id) on delete set null,
  service_name      text not null default '',
  staff_id          uuid references public.bk_staff(id) on delete set null,      -- 顧客希望的人員(可空)
  status            text not null default 'requested' check (status in ('requested', 'sent', 'accepted', 'declined', 'cancelled')),
  request           jsonb not null default '{}',     -- { event_date, time, event_type, address, people, note, images[] }
  contact           jsonb not null default '{}',     -- { name, phone }
  current_version   integer not null default 0,
  booking_id        uuid references public.bk_bookings(id) on delete set null,  -- 暫保留或接受後的預約
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists bk_quotes_business_idx on public.bk_quotes (business_id, created_at desc);
create index if not exists bk_quotes_customer_idx on public.bk_quotes (customer_user_id, created_at desc);
alter table public.bk_quotes enable row level security;

-- 報價版本(追加式,不修改舊版本)
create table if not exists public.bk_quote_versions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.bk_businesses(id) on delete cascade,
  quote_id        uuid not null references public.bk_quotes(id) on delete cascade,
  version         integer not null,
  items           jsonb not null default '[]',      -- [{ name, amount }]
  total           integer not null check (total >= 0),
  deposit         integer not null default 0 check (deposit >= 0),
  staff_id        uuid references public.bk_staff(id) on delete set null,
  start_at        timestamptz not null,
  minutes         integer not null check (minutes between 15 and 1440),
  travel_minutes  integer not null default 0 check (travel_minutes between 0 and 480),
  valid_until     timestamptz not null,
  hold_until      timestamptz,
  note            text not null default '',
  created_at      timestamptz not null default now(),
  unique (quote_id, version)
);
alter table public.bk_quote_versions enable row level security;

alter table public.bk_bookings add column if not exists quote_id uuid references public.bk_quotes(id) on delete set null;

-- 通知可以屬於詢價單(還沒有預約時)
alter table public.bk_notification_outbox alter column booking_id drop not null;
alter table public.bk_notification_outbox add column if not exists quote_id uuid references public.bk_quotes(id) on delete cascade;
create unique index if not exists bk_outbox_quote_unique on public.bk_notification_outbox (quote_id, event, audience, channel, booking_version) where quote_id is not null;

-- 私人檔案(參考圖、之後的服務照片)
insert into storage.buckets (id, name, public) values ('booking-private', 'booking-private', false)
on conflict (id) do update set public = false;

-- -------------------------------------------------------------
-- 建立預約 v2(C2):多了 p->>'quote_id'(由報價建立的預約)
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
      staff_id, staff_requested, resource_id, addons, total_price, deposit_amount, payment_status, created_by, quote_id)
    values (v_business, p->>'booking_no', v_customer, nullif(p->>'service_id', '')::uuid, p->'service_snapshot',
      (p->>'start_at')::timestamptz, (p->>'end_at')::timestamptz, (p->>'occupy_end_at')::timestamptz,
      p->>'status', p->>'approval_status', coalesce(p->'contact', '{}'::jsonb), nullif(p->>'source_card_id', '')::uuid,
      coalesce(nullif(p->>'source_channel', ''), 'card'), nullif(p->>'expires_at', '')::timestamptz, v_idem,
      (p->>'staff_id')::uuid, coalesce((p->>'staff_requested')::boolean, false), nullif(p->>'resource_id', '')::uuid,
      coalesce(p->'addons', '[]'::jsonb), coalesce((p->>'total_price')::int, 0), coalesce((p->>'deposit_amount')::int, 0),
      coalesce(nullif(p->>'payment_status', ''), 'none'), coalesce(nullif(p->>'created_by', ''), 'customer'), nullif(p->>'quote_id', '')::uuid)
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
-- 送出報價(單一交易):取消舊的暫保留 → 需要時建立新的暫保留預約 → 寫入版本 → 更新詢價單 → 通知顧客
-- p_hold:要暫保留時帶入 bk_create_booking2 的 p(衝突時整筆不成立,回傳 SLOT_UNAVAILABLE)
-- -------------------------------------------------------------
create or replace function public.bk_quote_send(p_quote_id uuid, p_expected_version integer, p_v jsonb, p_hold jsonb, p_actor uuid)
returns public.bk_quotes
language plpgsql security definer set search_path = public as $$
declare
  q public.bk_quotes;
  hold public.bk_bookings;
  v_next integer;
begin
  select * into q from public.bk_quotes where id = p_quote_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and q.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if q.status not in ('requested', 'sent') then raise exception 'INVALID_STATE'; end if;

  -- 舊的暫保留失效(占用由 trigger 一起失效)
  if q.booking_id is not null then
    update public.bk_bookings set status = 'cancelled', cancel_reason = '報價已更新', version = version + 1, updated_at = now()
     where id = q.booking_id and status = 'pending';
  end if;

  if p_hold is not null then
    select * into hold from public.bk_create_booking2(p_hold, '[]'::jsonb);
  end if;

  v_next := q.current_version + 1;
  insert into public.bk_quote_versions (business_id, quote_id, version, items, total, deposit, staff_id, start_at, minutes, travel_minutes, valid_until, hold_until, note)
  values (q.business_id, q.id, v_next, coalesce(p_v->'items', '[]'::jsonb), (p_v->>'total')::int, coalesce((p_v->>'deposit')::int, 0),
          nullif(p_v->>'staff_id', '')::uuid, (p_v->>'start_at')::timestamptz, (p_v->>'minutes')::int, coalesce((p_v->>'travel_minutes')::int, 0),
          (p_v->>'valid_until')::timestamptz, nullif(p_v->>'hold_until', '')::timestamptz, coalesce(p_v->>'note', ''));

  update public.bk_quotes
     set status = 'sent', current_version = v_next, booking_id = case when p_hold is not null then hold.id else null end,
         version = version + 1, updated_at = now()
   where id = q.id
   returning * into q;

  insert into public.bk_notification_outbox (business_id, quote_id, booking_version, event, audience)
  values (q.business_id, q.id, v_next, 'quote_sent', 'customer') on conflict do nothing;
  return q;
end $$;
revoke all on function public.bk_quote_send(uuid, integer, jsonb, jsonb, uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 顧客接受報價(單一交易):有效的暫保留 → 轉成待付訂金或成立;沒有暫保留 → 用 p_booking 新建(衝突則整筆不成立)
-- -------------------------------------------------------------
create or replace function public.bk_quote_accept(
  p_quote_id uuid, p_quote_version integer, p_customer uuid, p_booking jsonb,
  p_status text, p_payment text, p_expires timestamptz, p_notices jsonb
) returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  q public.bk_quotes;
  qv public.bk_quote_versions;
  b public.bk_bookings;
  n jsonb;
begin
  select * into q from public.bk_quotes where id = p_quote_id and customer_user_id = p_customer for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if q.status <> 'sent' then raise exception 'INVALID_STATE'; end if;
  if q.current_version <> p_quote_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into qv from public.bk_quote_versions where quote_id = q.id and version = q.current_version;
  if qv.valid_until < now() then raise exception 'QUOTE_EXPIRED'; end if;

  if q.booking_id is not null then
    select * into b from public.bk_bookings where id = q.booking_id for update;
  end if;

  if b.id is not null and b.status = 'pending' and (b.expires_at is null or b.expires_at > now()) then
    update public.bk_bookings
       set status = p_status, approval_status = 'approved', payment_status = p_payment,
           customer_user_id = p_customer, expires_at = case when p_status = 'pending' then p_expires else null end,
           version = version + 1, updated_at = now()
     where id = b.id
     returning * into b;
    insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
    values (b.id, b.business_id, b.version, 'quote_accepted', 'customer', p_customer, jsonb_build_object('quote_version', q.current_version));
    for n in select * from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) loop
      insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience, due_at)
      values (b.business_id, b.id, b.version, n->>'event', n->>'audience', coalesce((n->>'due_at')::timestamptz, now()))
      on conflict do nothing;
    end loop;
  else
    -- 暫保留已過期或沒有暫保留:重新取得檔期
    select * into b from public.bk_create_booking2(p_booking, p_notices);
  end if;

  update public.bk_quotes set status = 'accepted', booking_id = b.id, version = version + 1, updated_at = now() where id = q.id;
  return b;
end $$;
revoke all on function public.bk_quote_accept(uuid, integer, uuid, jsonb, text, text, timestamptz, jsonb) from public, anon, authenticated;

-- 婉拒 / 取消詢價:暫保留一起失效
create or replace function public.bk_quote_close(p_quote_id uuid, p_status text, p_actor_type text, p_actor uuid)
returns public.bk_quotes
language plpgsql security definer set search_path = public as $$
declare
  q public.bk_quotes;
begin
  select * into q from public.bk_quotes where id = p_quote_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if q.status not in ('requested', 'sent') then raise exception 'INVALID_STATE'; end if;
  if q.booking_id is not null then
    update public.bk_bookings set status = 'cancelled', cancel_reason = case when p_status = 'declined' then '顧客婉拒報價' else '店家取消詢價' end,
           version = version + 1, updated_at = now()
     where id = q.booking_id and status = 'pending';
  end if;
  update public.bk_quotes set status = p_status, version = version + 1, updated_at = now() where id = q.id returning * into q;
  insert into public.bk_notification_outbox (business_id, quote_id, booking_version, event, audience)
  values (q.business_id, q.id, q.current_version, 'quote_' || p_status, case when p_actor_type = 'customer' then 'owner' else 'customer' end)
  on conflict do nothing;
  return q;
end $$;
revoke all on function public.bk_quote_close(uuid, text, text, uuid) from public, anon, authenticated;
