-- =============================================================
-- URBANLINKS 預約系統 B 階段(第一個營運版)
-- 規格 17 章 B:一人及一店多人、指定 / 不限人員、加購、基本床位、人工確認、訂金尾款、改期取消、日曆
-- - 防重複預約改為「每位人員」與「每張床位」各自的排他約束(原本是整個商家一條)
-- - 訂金先支援轉帳 / 現金人工核銷(bk_payments 追加式紀錄);線上金流之後再接
-- 需先執行過 migration-booking.sql。可重複執行。
-- =============================================================

-- 服務人員(一人工作室也有一位,系統自動建立)
create table if not exists public.bk_staff (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.bk_businesses(id) on delete cascade,
  name               text not null,
  title              text not null default '',
  avatar             text not null default '',
  active             boolean not null default true,
  use_business_hours boolean not null default true,     -- true = 跟營業時段;false = 用自己的班表
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists bk_staff_business_idx on public.bk_staff (business_id, sort_order);

-- 人員自己的每週班表(use_business_hours = false 時使用)
create table if not exists public.bk_staff_hours (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  staff_id     uuid not null references public.bk_staff(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  start_min    integer not null check (start_min between 0 and 1439),
  end_min      integer not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);
create index if not exists bk_staff_hours_staff_idx on public.bk_staff_hours (staff_id, weekday);

-- 人員可做的服務(可個別設定時間與價格;服務沒有任何對應時 = 所有人員都可做)
create table if not exists public.bk_staff_services (
  staff_id          uuid not null references public.bk_staff(id) on delete cascade,
  service_id        uuid not null references public.bk_services(id) on delete cascade,
  business_id       uuid not null references public.bk_businesses(id) on delete cascade,
  duration_minutes  integer check (duration_minutes between 5 and 720),
  price             integer check (price >= 0),
  primary key (staff_id, service_id)
);

-- 床位 / 座位 / 設備(一個單位一筆)
create table if not exists public.bk_resources (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  name         text not null,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists bk_resources_business_idx on public.bk_resources (business_id, sort_order);

-- 加購項目(屬於某個服務,可加價、加時間)
create table if not exists public.bk_addons (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.bk_businesses(id) on delete cascade,
  service_id     uuid not null references public.bk_services(id) on delete cascade,
  name           text not null,
  price          integer not null default 0 check (price >= 0),
  extra_minutes  integer not null default 0 check (extra_minutes between 0 and 240),
  active         boolean not null default true,
  sort_order     integer not null default 0
);
create index if not exists bk_addons_service_idx on public.bk_addons (service_id, sort_order);

-- 收款紀錄(追加式;退款也是一筆,不修改舊紀錄)
create table if not exists public.bk_payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  booking_id   uuid not null references public.bk_bookings(id) on delete cascade,
  kind         text not null check (kind in ('deposit', 'balance', 'refund')),
  amount       integer not null check (amount > 0),
  method       text not null default 'transfer' check (method in ('transfer', 'cash', 'card', 'other')),
  note         text not null default '',
  actor_type   text not null,
  actor_id     uuid,
  created_at   timestamptz not null default now()
);
create index if not exists bk_payments_booking_idx on public.bk_payments (booking_id, created_at);

-- 商家設定
alter table public.bk_businesses add column if not exists allow_any_staff boolean not null default true;   -- 顧客可選「不指定人員」
alter table public.bk_businesses add column if not exists deposit_hours integer not null default 24;        -- 訂金轉帳期限(小時)
alter table public.bk_businesses add column if not exists payment_info text not null default '';            -- 匯款資訊
alter table public.bk_businesses add column if not exists reschedule_limit integer not null default 1;      -- 顧客可自行改期次數

-- 服務:需要床位、訂金
alter table public.bk_services add column if not exists needs_resource boolean not null default false;
alter table public.bk_services add column if not exists deposit integer not null default 0;                 -- 0 = 不收訂金

-- 休假可只針對某位人員(null = 全店)
alter table public.bk_exceptions add column if not exists staff_id uuid references public.bk_staff(id) on delete cascade;

-- 預約:人員、床位、加購、金額與收款進度
alter table public.bk_bookings add column if not exists staff_id uuid references public.bk_staff(id) on delete restrict;
alter table public.bk_bookings add column if not exists staff_requested boolean not null default false;   -- 顧客指定(true)或系統分派
alter table public.bk_bookings add column if not exists resource_id uuid references public.bk_resources(id) on delete set null;
alter table public.bk_bookings add column if not exists addons jsonb not null default '[]';
alter table public.bk_bookings add column if not exists total_price integer not null default 0;
alter table public.bk_bookings add column if not exists deposit_amount integer not null default 0;
alter table public.bk_bookings add column if not exists paid_amount integer not null default 0;
alter table public.bk_bookings add column if not exists payment_status text not null default 'none';
alter table public.bk_bookings add column if not exists payment_report jsonb not null default '{}';        -- 顧客回報的轉帳資訊
alter table public.bk_bookings add column if not exists reschedule_count integer not null default 0;
alter table public.bk_bookings add column if not exists created_by text not null default 'customer';      -- customer / owner(人工加單)
alter table public.bk_bookings alter column customer_user_id drop not null;                                 -- 人工加單可沒有顧客帳號

do $$ begin
  alter table public.bk_bookings add constraint bk_bookings_payment_status_check
    check (payment_status in ('none', 'awaiting', 'reported', 'deposit_paid', 'paid', 'refunded'));
exception when duplicate_object or duplicate_table then null; end $$;

alter table public.bk_bookings drop constraint if exists bk_bookings_status_check;
alter table public.bk_bookings add constraint bk_bookings_status_check
  check (status in ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'expired'));

-- 既有商家:自動建立一位人員(名片主人本人),既有預約歸給這位人員
insert into public.bk_staff (business_id, name)
select b.id, coalesce(nullif(b.name, ''), '我')
  from public.bk_businesses b
 where not exists (select 1 from public.bk_staff s where s.business_id = b.id);

update public.bk_bookings bk
   set staff_id = (select s.id from public.bk_staff s where s.business_id = bk.business_id order by s.sort_order, s.created_at limit 1)
 where bk.staff_id is null;

update public.bk_bookings set total_price = coalesce((service_snapshot->>'price')::int, 0) where total_price = 0;

-- 沒帶人員的新預約(舊版程式、保險)自動歸給第一位人員,確保排他約束一定生效
create or replace function public.bk_bookings_default_staff() returns trigger
language plpgsql as $$
begin
  if new.staff_id is null then
    select id into new.staff_id from public.bk_staff where business_id = new.business_id and active order by sort_order, created_at limit 1;
  end if;
  return new;
end $$;
drop trigger if exists bk_bookings_default_staff on public.bk_bookings;
create trigger bk_bookings_default_staff before insert on public.bk_bookings
  for each row execute function public.bk_bookings_default_staff();

-- 防重複:同一位人員、同一張床位同一時間只能有一筆有效預約(前含後不含,含整理時間)
alter table public.bk_bookings drop constraint if exists bk_bookings_no_overlap;
do $$ begin
  alter table public.bk_bookings add constraint bk_bookings_staff_no_overlap
    exclude using gist (staff_id with =, tstzrange(start_at, occupy_end_at, '[)') with &&)
    where (status in ('pending', 'confirmed', 'checked_in'));
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.bk_bookings add constraint bk_bookings_resource_no_overlap
    exclude using gist (resource_id with =, tstzrange(start_at, occupy_end_at, '[)') with &&)
    where (status in ('pending', 'confirmed', 'checked_in') and resource_id is not null);
exception when duplicate_object or duplicate_table then null; end $$;
create index if not exists bk_bookings_staff_start_idx on public.bk_bookings (staff_id, start_at);

alter table public.bk_staff enable row level security;
alter table public.bk_staff_hours enable row level security;
alter table public.bk_staff_services enable row level security;
alter table public.bk_resources enable row level security;
alter table public.bk_addons enable row level security;
alter table public.bk_payments enable row level security;

-- -------------------------------------------------------------
-- 建立預約 v2(單一交易):p 帶入所有欄位
-- 衝突(人員或床位)回傳 SLOT_UNAVAILABLE;相同 idempotency_key 回傳原預約
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

  -- 逾期未確認 / 未付訂金的預約先釋放(不只靠排程)
  update public.bk_bookings
     set status = 'expired', approval_status = case when approval_status = 'pending' then 'rejected' else approval_status end,
         version = version + 1, updated_at = now()
   where business_id = v_business and status = 'pending' and expires_at is not null and expires_at < now();

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
  exception
    when exclusion_violation then raise exception 'SLOT_UNAVAILABLE';
    when unique_violation then
      if v_idem is not null and v_customer is not null then
        select * into existing from public.bk_bookings where customer_user_id = v_customer and idempotency_key = v_idem;
        if found then return existing; end if;
      end if;
      raise;
  end;

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
-- 狀態變更 v2:多了 p_expires(待成立時的新期限,例如核准後開始算訂金期限)與 p_payment_status
-- -------------------------------------------------------------
drop function if exists public.bk_transition(uuid, integer, text[], text, text, text, text, uuid, text, jsonb);
create or replace function public.bk_transition(
  p_booking_id uuid, p_expected_version integer, p_from text[], p_status text, p_approval text,
  p_reason text, p_actor_type text, p_actor uuid, p_event text, p_notices jsonb,
  p_expires timestamptz default null, p_payment_status text default null
) returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bk_bookings;
  n jsonb;
begin
  select * into b from public.bk_bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if not (b.status = any(p_from)) then raise exception 'INVALID_STATE'; end if;

  update public.bk_bookings
     set status = p_status,
         approval_status = coalesce(p_approval, approval_status),
         payment_status = coalesce(p_payment_status, payment_status),
         cancel_reason = case when p_status = 'cancelled' then coalesce(p_reason, '') else cancel_reason end,
         expires_at = case when p_status = 'pending' then coalesce(p_expires, expires_at) else null end,
         version = version + 1, updated_at = now()
   where id = p_booking_id
   returning * into b;

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (b.id, b.business_id, b.version, p_event, p_actor_type, p_actor, jsonb_build_object('status', p_status, 'reason', coalesce(p_reason, '')));

  for n in select * from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) loop
    insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience, due_at)
    values (b.business_id, b.id, b.version, n->>'event', n->>'audience', coalesce((n->>'due_at')::timestamptz, now()))
    on conflict do nothing;
  end loop;
  return b;
end $$;
revoke all on function public.bk_transition(uuid, integer, text[], text, text, text, text, uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 記錄收款 / 退款(單一交易):寫收款紀錄 → 重算已收金額與收款進度 →
-- 待成立且已核准(或免審核)且訂金已足 → 自動成立
-- p_confirm_notices:因收款而成立時才寫入的通知(確認、提醒)
-- -------------------------------------------------------------
create or replace function public.bk_record_payment(
  p_booking_id uuid, p_expected_version integer, p_kind text, p_amount integer, p_method text, p_note text,
  p_actor_type text, p_actor uuid, p_confirm_notices jsonb
) returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bk_bookings;
  v_paid integer;
  v_pay text;
  v_status text;
  v_confirm boolean := false;
  n jsonb;
begin
  select * into b from public.bk_bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'VALIDATION_ERROR'; end if;
  if p_kind = 'refund' and p_amount > b.paid_amount then raise exception 'VALIDATION_ERROR'; end if;
  if p_kind <> 'refund' and b.status in ('expired') then raise exception 'INVALID_STATE'; end if;

  insert into public.bk_payments (business_id, booking_id, kind, amount, method, note, actor_type, actor_id)
  values (b.business_id, b.id, p_kind, p_amount, coalesce(p_method, 'transfer'), coalesce(p_note, ''), p_actor_type, p_actor);

  v_paid := b.paid_amount + case when p_kind = 'refund' then -p_amount else p_amount end;
  v_pay := case
    when p_kind = 'refund' and v_paid = 0 then 'refunded'
    when b.total_price > 0 and v_paid >= b.total_price then 'paid'
    when v_paid > 0 and v_paid >= b.deposit_amount then 'deposit_paid'
    when b.deposit_amount > 0 then 'awaiting'
    else b.payment_status end;
  v_status := b.status;
  if b.status = 'pending' and b.approval_status in ('not_required', 'approved') and v_paid >= b.deposit_amount then
    v_status := 'confirmed';
    v_confirm := true;
  end if;

  update public.bk_bookings
     set paid_amount = v_paid, payment_status = v_pay, status = v_status,
         expires_at = case when v_confirm then null else expires_at end,
         version = version + 1, updated_at = now()
   where id = b.id
   returning * into b;

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (b.id, b.business_id, b.version, 'payment_' || p_kind, p_actor_type, p_actor,
          jsonb_build_object('amount', p_amount, 'method', p_method, 'paid_amount', v_paid, 'confirmed', v_confirm));

  if v_confirm then
    for n in select * from jsonb_array_elements(coalesce(p_confirm_notices, '[]'::jsonb)) loop
      insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience, due_at)
      values (b.business_id, b.id, b.version, n->>'event', n->>'audience', coalesce((n->>'due_at')::timestamptz, now()))
      on conflict do nothing;
    end loop;
  end if;
  return b;
end $$;
revoke all on function public.bk_record_payment(uuid, integer, text, integer, text, text, text, uuid, jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 顧客回報已轉帳(不等於已收款,由店家核對後記錄收款)
-- -------------------------------------------------------------
create or replace function public.bk_report_payment(p_booking_id uuid, p_expected_version integer, p_customer uuid, p_report jsonb)
returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bk_bookings;
begin
  select * into b from public.bk_bookings where id = p_booking_id and customer_user_id = p_customer for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if b.status <> 'pending' or b.payment_status not in ('awaiting', 'reported') then raise exception 'INVALID_STATE'; end if;

  update public.bk_bookings
     set payment_status = 'reported', payment_report = coalesce(p_report, '{}'::jsonb) || jsonb_build_object('at', now()),
         version = version + 1, updated_at = now()
   where id = b.id
   returning * into b;

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (b.id, b.business_id, b.version, 'payment_reported', 'customer', p_customer, coalesce(p_report, '{}'::jsonb));
  insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience)
  values (b.business_id, b.id, b.version, 'payment_reported', 'owner') on conflict do nothing;
  return b;
end $$;
revoke all on function public.bk_report_payment(uuid, integer, uuid, jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 改期 / 改人員(單一交易):新時段衝突時整筆不變(舊預約仍有效),回傳 SLOT_UNAVAILABLE
-- 版本 +1 讓舊的提醒失效,並寫入新時段的提醒
-- -------------------------------------------------------------
create or replace function public.bk_reschedule(
  p_booking_id uuid, p_expected_version integer, p_staff uuid, p_resource uuid,
  p_start timestamptz, p_end timestamptz, p_occupy_end timestamptz,
  p_actor_type text, p_actor uuid, p_count boolean, p_notices jsonb
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
revoke all on function public.bk_reschedule(uuid, integer, uuid, uuid, timestamptz, timestamptz, timestamptz, text, uuid, boolean, jsonb) from public, anon, authenticated;
