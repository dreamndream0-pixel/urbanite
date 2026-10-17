-- =============================================================
-- URBANLINKS 名片 × LINE 預約系統(第一階段:一人工作室)
-- 規格:URBANLINKS_LINE_Booking_Complete_Spec(2026-10-17)第 A / B 階段的最小可用版本
-- - 預約商家以「名片主人」為單位(profile_cards.owner_user_id);之後多人店 / 分店再延伸
-- - 同一商家同一時間只能成立一筆有效預約:由資料庫排他約束保證(不是只靠前台判斷)
-- - 只透過後端 service_role 讀寫(RLS 開啟、不建公開政策)
-- 可重複執行。
-- =============================================================
create extension if not exists btree_gist;

-- 預約商家(名片主人的工作室)
create table if not exists public.bk_businesses (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null unique,
  card_id         uuid references public.profile_cards(id) on delete set null,
  name            text not null default '',
  enabled         boolean not null default false,            -- 開放顧客預約(預設關閉)
  timezone        text not null default 'Asia/Taipei',
  approval_mode   text not null default 'manual' check (approval_mode in ('auto', 'manual')),
  slot_interval   integer not null default 30 check (slot_interval in (15, 30, 60)),
  lead_minutes    integer not null default 120 check (lead_minutes between 0 and 10080),   -- 最短提前
  advance_days    integer not null default 30 check (advance_days between 1 and 180),      -- 可約天數
  buffer_minutes  integer not null default 0 check (buffer_minutes between 0 and 120),     -- 服務後整理時間
  approve_hours   integer not null default 12 check (approve_hours between 1 and 168),     -- 人工確認期限
  cancel_hours    integer not null default 24 check (cancel_hours between 0 and 168),      -- 顧客可自行取消到服務前幾小時
  address         text not null default '',
  notice          text not null default '',                  -- 預約須知
  reminder_24h    boolean not null default true,
  reminder_2h     boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 服務項目
create table if not exists public.bk_services (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.bk_businesses(id) on delete cascade,
  name             text not null,
  description      text not null default '',
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  price            integer not null default 0 check (price >= 0),
  price_note       text not null default '',                 -- 例:起、依現場報價
  image            text not null default '',
  active           boolean not null default true,
  sort_order       integer not null default 0,
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists bk_services_business_idx on public.bk_services (business_id, sort_order);

-- 每週營業時段(同一天可多段;分鐘數 0–1440,依商家時區)
create table if not exists public.bk_hours (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),   -- 0 = 週日
  start_min    integer not null check (start_min between 0 and 1439),
  end_min      integer not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);
create index if not exists bk_hours_business_idx on public.bk_hours (business_id, weekday);

-- 休假 / 不開放時段
create table if not exists public.bk_exceptions (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  reason       text not null default '',
  created_at   timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists bk_exceptions_business_idx on public.bk_exceptions (business_id, start_at);

-- 預約
create table if not exists public.bk_bookings (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.bk_businesses(id) on delete restrict,
  booking_no        text not null unique,
  customer_user_id  uuid not null,
  service_id        uuid references public.bk_services(id) on delete set null,
  service_snapshot  jsonb not null,                           -- 名稱、時長、價格(之後改服務不影響既有預約)
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  occupy_end_at     timestamptz not null,                     -- 含整理時間的占用結束
  status            text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired')),
  approval_status   text not null default 'not_required' check (approval_status in ('not_required', 'pending', 'approved', 'rejected')),
  contact           jsonb not null default '{}',              -- { name, phone, note }
  source_card_id    uuid,
  source_channel    text not null default 'card',
  expires_at        timestamptz,                              -- 待確認的截止時間
  cancel_reason     text not null default '',
  idempotency_key   text,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_at > start_at and occupy_end_at >= end_at)
);
create index if not exists bk_bookings_business_start_idx on public.bk_bookings (business_id, start_at);
create index if not exists bk_bookings_customer_idx on public.bk_bookings (customer_user_id, start_at desc);
create unique index if not exists bk_bookings_idem_key on public.bk_bookings (customer_user_id, idempotency_key) where idempotency_key is not null;

-- 同一商家(一人工作室)同一時間只能有一筆有效預約(前含後不含,含整理時間)
do $$ begin
  alter table public.bk_bookings add constraint bk_bookings_no_overlap
    exclude using gist (business_id with =, tstzrange(start_at, occupy_end_at, '[)') with &&)
    where (status in ('pending', 'confirmed'));
exception when duplicate_object or duplicate_table then null; end $$;

-- 預約歷程(追加式)
create table if not exists public.bk_booking_events (
  id           bigserial primary key,
  booking_id   uuid not null references public.bk_bookings(id) on delete cascade,
  business_id  uuid not null,
  version      integer not null,
  type         text not null,
  actor_type   text not null,          -- customer / owner / system
  actor_id     uuid,
  payload      jsonb not null default '{}',
  occurred_at  timestamptz not null default now()
);
create index if not exists bk_booking_events_booking_idx on public.bk_booking_events (booking_id, id);

-- 通知待發清單(預約異動同時寫入,背景工作可靠送出;提醒依 booking_version 判斷是否過期)
create table if not exists public.bk_notification_outbox (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null,
  booking_id       uuid not null references public.bk_bookings(id) on delete cascade,
  booking_version  integer not null,
  event            text not null,
  audience         text not null check (audience in ('customer', 'owner')),
  channel          text not null default 'line',
  due_at           timestamptz not null default now(),
  state            text not null default 'queued' check (state in ('queued', 'processing', 'api_accepted', 'failed', 'skipped')),
  attempts         integer not null default 0,
  lease_until      timestamptz,
  last_error       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists bk_outbox_unique on public.bk_notification_outbox (booking_id, event, audience, channel, booking_version);
create index if not exists bk_outbox_due_idx on public.bk_notification_outbox (state, due_at);

alter table public.bk_businesses enable row level security;
alter table public.bk_services enable row level security;
alter table public.bk_hours enable row level security;
alter table public.bk_exceptions enable row level security;
alter table public.bk_bookings enable row level security;
alter table public.bk_booking_events enable row level security;
alter table public.bk_notification_outbox enable row level security;

-- -------------------------------------------------------------
-- 建立預約(單一交易):回收逾期的待確認 → 寫入預約 → 寫入歷程與通知
-- 時段衝突由排他約束擋下,回傳 SLOT_UNAVAILABLE;相同 idempotency_key 回傳原預約
-- -------------------------------------------------------------
create or replace function public.bk_create_booking(
  p_business_id uuid, p_customer uuid, p_service_id uuid, p_service_snapshot jsonb,
  p_start timestamptz, p_end timestamptz, p_occupy_end timestamptz,
  p_status text, p_approval text, p_expires timestamptz,
  p_contact jsonb, p_source_card uuid, p_source_channel text, p_idem text, p_booking_no text,
  p_notices jsonb
) returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  existing public.bk_bookings;
  created public.bk_bookings;
  n jsonb;
begin
  if p_idem is not null then
    select * into existing from public.bk_bookings where customer_user_id = p_customer and idempotency_key = p_idem;
    if found then return existing; end if;
  end if;

  -- 逾期未確認的預約先釋放(不只靠排程)
  update public.bk_bookings
     set status = 'expired', approval_status = case when approval_status = 'pending' then 'rejected' else approval_status end,
         version = version + 1, updated_at = now()
   where business_id = p_business_id and status = 'pending' and expires_at is not null and expires_at < now();

  begin
    insert into public.bk_bookings (business_id, booking_no, customer_user_id, service_id, service_snapshot, start_at, end_at, occupy_end_at,
      status, approval_status, contact, source_card_id, source_channel, expires_at, idempotency_key)
    values (p_business_id, p_booking_no, p_customer, p_service_id, p_service_snapshot, p_start, p_end, p_occupy_end,
      p_status, p_approval, coalesce(p_contact, '{}'::jsonb), p_source_card, coalesce(p_source_channel, 'card'), p_expires, p_idem)
    returning * into created;
  exception
    when exclusion_violation then raise exception 'SLOT_UNAVAILABLE';
    when unique_violation then
      if p_idem is not null then
        select * into existing from public.bk_bookings where customer_user_id = p_customer and idempotency_key = p_idem;
        if found then return existing; end if;
      end if;
      raise;
  end;

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (created.id, p_business_id, 1, 'created', 'customer', p_customer, jsonb_build_object('status', p_status));

  for n in select * from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) loop
    insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience, due_at)
    values (p_business_id, created.id, 1, n->>'event', n->>'audience', coalesce((n->>'due_at')::timestamptz, now()))
    on conflict do nothing;
  end loop;
  return created;
end $$;

-- -------------------------------------------------------------
-- 變更預約狀態(核准 / 拒絕 / 完成 / 未到 / 取消 / 到期):檢查版本,同交易寫歷程與通知
-- -------------------------------------------------------------
create or replace function public.bk_transition(
  p_booking_id uuid, p_expected_version integer, p_from text[], p_status text, p_approval text,
  p_reason text, p_actor_type text, p_actor uuid, p_event text, p_notices jsonb
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
         cancel_reason = case when p_status = 'cancelled' then coalesce(p_reason, '') else cancel_reason end,
         expires_at = case when p_status = 'pending' then expires_at else null end,
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

revoke all on function public.bk_create_booking(uuid, uuid, uuid, jsonb, timestamptz, timestamptz, timestamptz, text, text, timestamptz, jsonb, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.bk_transition(uuid, integer, text[], text, text, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 背景工作領取待發通知:到期的 queued,或 processing 但租約已過期(工作中斷)的任務
-- skip locked 讓同時執行的排程不會領到同一筆
-- -------------------------------------------------------------
create or replace function public.bk_claim_outbox(p_limit integer default 30)
returns setof public.bk_notification_outbox
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.bk_notification_outbox o
     set state = 'processing', lease_until = now() + interval '2 minutes', attempts = o.attempts + 1, updated_at = now()
   where o.id in (
     select id from public.bk_notification_outbox
      where (state = 'queued' and due_at <= now()) or (state = 'processing' and lease_until < now())
      order by due_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning o.*;
end $$;
revoke all on function public.bk_claim_outbox(integer) from public, anon, authenticated;
