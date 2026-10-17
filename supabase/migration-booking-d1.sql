-- =============================================================
-- URBANLINKS 預約系統 D1:候補名單、自動回訪
-- - 候補:額滿時登記日期 + 時段範圍;有空位時依登記順序一次邀請一位(有接受期限,不保留名額)
-- - 回訪:服務完成後感謝訊息、依服務設定的天數提醒回訪(顧客可關閉;已再預約就不提醒)
-- 需先執行過 migration-booking-c4.sql。可重複執行。
-- =============================================================

create table if not exists public.bk_waitlist (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.bk_businesses(id) on delete cascade,
  customer_user_id   uuid not null,
  service_id         uuid not null references public.bk_services(id) on delete cascade,
  staff_id           uuid references public.bk_staff(id) on delete set null,
  date               date not null,
  from_min           integer not null default 0 check (from_min between 0 and 1439),
  to_min             integer not null default 1440 check (to_min between 1 and 1440),
  contact            jsonb not null default '{}',
  status             text not null default 'waiting' check (status in ('waiting', 'invited', 'booked', 'expired', 'cancelled')),
  invited_slot       text,                              -- 邀請的開始時間 HH:MM
  invite_expires_at  timestamptz,
  invite_count       integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (to_min > from_min)
);
create index if not exists bk_waitlist_open_idx on public.bk_waitlist (business_id, date, status, created_at);
create index if not exists bk_waitlist_customer_idx on public.bk_waitlist (customer_user_id, created_at desc);
alter table public.bk_waitlist enable row level security;

alter table public.bk_businesses add column if not exists waitlist_enabled boolean not null default true;
alter table public.bk_businesses add column if not exists waitlist_invite_minutes integer not null default 60;
alter table public.bk_businesses add column if not exists thanks_enabled boolean not null default false;
alter table public.bk_businesses add column if not exists thanks_message text not null default '';
alter table public.bk_services add column if not exists revisit_days integer not null default 0;     -- 0 = 不提醒回訪
alter table public.bk_customers add column if not exists marketing_opt_out boolean not null default false;

-- 通知可以屬於候補登記
alter table public.bk_notification_outbox add column if not exists waitlist_id uuid references public.bk_waitlist(id) on delete cascade;
create unique index if not exists bk_outbox_waitlist_unique on public.bk_notification_outbox (waitlist_id, event, audience, channel, booking_version) where waitlist_id is not null;
