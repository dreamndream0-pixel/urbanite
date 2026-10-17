-- =============================================================
-- URBANLINKS 預約系統 D4:行事曆
-- - 匯出:商家與每位人員各有一個私密的 .ics 訂閱網址(Google / Apple 行事曆訂閱,單向)
-- - 匯入:貼上外部行事曆的私密 iCal 網址(Google「私密網址」、iCloud、Outlook),定期讀取忙碌時段,這些時間不開放預約
-- 需先執行過 migration-booking-d3.sql。可重複執行。
-- =============================================================

alter table public.bk_businesses add column if not exists calendar_token text;
alter table public.bk_staff add column if not exists calendar_token text;
create unique index if not exists bk_businesses_calendar_token on public.bk_businesses (calendar_token) where calendar_token is not null;
create unique index if not exists bk_staff_calendar_token on public.bk_staff (calendar_token) where calendar_token is not null;

create table if not exists public.bk_external_calendars (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.bk_businesses(id) on delete cascade,
  staff_id        uuid references public.bk_staff(id) on delete cascade,     -- 空 = 全店
  label           text not null default '',
  url             text not null,
  active          boolean not null default true,
  last_synced_at  timestamptz,
  last_error      text not null default '',
  event_count     integer not null default 0,
  created_at      timestamptz not null default now()
);
alter table public.bk_external_calendars enable row level security;

create table if not exists public.bk_external_busy (
  id           bigserial primary key,
  calendar_id  uuid not null references public.bk_external_calendars(id) on delete cascade,
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  staff_id     uuid references public.bk_staff(id) on delete cascade,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  check (end_at > start_at)
);
create index if not exists bk_external_busy_range on public.bk_external_busy (business_id, start_at);
alter table public.bk_external_busy enable row level security;
