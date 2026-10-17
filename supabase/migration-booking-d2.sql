-- =============================================================
-- URBANLINKS 預約系統 D2:人員抽成結算、營運報表
-- - bk_staff.commission_rate:抽成 %(依實際服務人員、服務營收計算,退款回沖)
-- - bk_payroll_runs:結算紀錄(鎖定當時的計算結果,之後的退款列入下一期)
-- 需先執行過 migration-booking-d1.sql。可重複執行。
-- =============================================================

alter table public.bk_staff add column if not exists commission_rate numeric(5, 2) not null default 0 check (commission_rate between 0 and 100);

create table if not exists public.bk_payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.bk_businesses(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  snapshot      jsonb not null,            -- [{ staff_id, name, revenue, refunds, net, rate, commission, services }]
  total         integer not null default 0,
  note          text not null default '',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists bk_payroll_runs_business_idx on public.bk_payroll_runs (business_id, period_start desc);
alter table public.bk_payroll_runs enable row level security;

-- 同一段期間不能重複結算(期間重疊也不行)
create extension if not exists btree_gist;
do $$ begin
  alter table public.bk_payroll_runs add constraint bk_payroll_runs_no_overlap
    exclude using gist (business_id with =, daterange(period_start, period_end, '[]') with &&);
exception when duplicate_object or duplicate_table then null; end $$;
