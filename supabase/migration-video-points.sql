-- Seedance Studio 影片點數:會員點數餘額、點數帳本、點數購買訂單(VP 開頭,走既有藍新金流)。
-- 所有寫入都經由下方 service_role 專用函式,在同一個交易內完成,不開放前端直接讀寫。
begin;

create table if not exists public.video_point_accounts (
  user_id        uuid primary key,
  balance        integer not null default 0 check (balance >= 0),
  trial_granted  boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- 每一筆點數變動都留紀錄;(reason, ref) 唯一,確保入帳、扣點、退點都不會重複。
create table if not exists public.video_point_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  delta       integer not null,
  reason      text not null check (reason in ('purchase', 'trial', 'generate', 'refund')),
  ref         text not null,
  created_at  timestamptz not null default now(),
  unique (reason, ref)
);
create index if not exists video_point_ledger_user_idx on public.video_point_ledger (user_id, created_at desc);

create table if not exists public.video_point_payments (
  id          uuid primary key default gen_random_uuid(),
  order_no    text not null unique,
  user_id     uuid not null,
  package     text not null,
  points      integer not null check (points > 0),
  amount      integer not null check (amount > 0),
  status      text not null default 'pending',  -- pending / paid
  trade_no    text not null default '',
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists video_point_payments_user_idx on public.video_point_payments (user_id);

alter table public.video_point_accounts enable row level security;
alter table public.video_point_ledger enable row level security;
alter table public.video_point_payments enable row level security;

-- 加點(購買、試用、退點共用)。呼叫端需先取得同一會員的 advisory lock。
create or replace function public.video_points_credit_internal(p_user uuid, p_delta integer, p_reason text, p_ref text)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_balance integer;
begin
  insert into public.video_point_ledger (user_id, delta, reason, ref) values (p_user, p_delta, p_reason, p_ref);
  insert into public.video_point_accounts (user_id, balance) values (p_user, p_delta)
    on conflict (user_id) do update set balance = public.video_point_accounts.balance + p_delta, updated_at = now()
    returning balance into next_balance;
  return next_balance;
end; $$;

create or replace function public.settle_video_points_v1(p_order_no text, p_amount integer, p_trade_no text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare payment public.video_point_payments%rowtype;
begin
  if p_amount is null or p_amount <= 0 or p_trade_no is null or length(trim(p_trade_no)) = 0 then
    raise exception 'INVALID_PAYMENT';
  end if;
  select * into payment from public.video_point_payments where order_no = p_order_no for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if payment.amount <> p_amount then raise exception 'AMOUNT_MISMATCH'; end if;
  if payment.status = 'paid' then
    if payment.trade_no <> '' and payment.trade_no <> p_trade_no then raise exception 'TRADE_MISMATCH'; end if;
    return true;
  end if;
  if payment.status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('video-points:' || payment.user_id::text, 0));
  perform public.video_points_credit_internal(payment.user_id, payment.points, 'purchase', payment.order_no);
  update public.video_point_payments set status = 'paid', trade_no = p_trade_no, paid_at = now() where order_no = p_order_no;
  return true;
end; $$;

-- 每位會員只送一次試用點數;回傳目前餘額。
create or replace function public.video_points_grant_trial_v1(p_user uuid, p_points integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare account public.video_point_accounts%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('video-points:' || p_user::text, 0));
  insert into public.video_point_accounts (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into account from public.video_point_accounts where user_id = p_user for update;
  if account.trial_granted or p_points <= 0 then return account.balance; end if;
  update public.video_point_accounts set trial_granted = true where user_id = p_user;
  return public.video_points_credit_internal(p_user, p_points, 'trial', p_user::text);
end; $$;

-- 生成前扣點。同一個 p_ref(影片任務 ID)重複呼叫不會重複扣。點數不足時丟出 INSUFFICIENT_POINTS。
create or replace function public.video_points_debit_v1(p_user uuid, p_points integer, p_ref text)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_balance integer;
begin
  if p_points is null or p_points <= 0 or p_ref is null or length(p_ref) = 0 then raise exception 'INVALID_DEBIT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('video-points:' || p_user::text, 0));
  if exists (select 1 from public.video_point_ledger where reason = 'generate' and ref = p_ref) then
    if not exists (select 1 from public.video_point_ledger where reason = 'generate' and ref = p_ref and user_id = p_user) then raise exception 'REF_CONFLICT'; end if;
    select balance into next_balance from public.video_point_accounts where user_id = p_user;
    return next_balance;
  end if;
  update public.video_point_accounts set balance = balance - p_points, updated_at = now()
    where user_id = p_user and balance >= p_points returning balance into next_balance;
  if not found then raise exception 'INSUFFICIENT_POINTS'; end if;
  insert into public.video_point_ledger (user_id, delta, reason, ref) values (p_user, -p_points, 'generate', p_ref);
  return next_balance;
end; $$;

-- 生成失敗時退回該任務扣的點數;只退一次,沒有扣過就不動作。
create or replace function public.video_points_refund_v1(p_user uuid, p_ref text)
returns integer language plpgsql security definer set search_path = '' as $$
declare charged integer; next_balance integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('video-points:' || p_user::text, 0));
  select -delta into charged from public.video_point_ledger where reason = 'generate' and ref = p_ref and user_id = p_user;
  if charged is null or exists (select 1 from public.video_point_ledger where reason = 'refund' and ref = p_ref) then
    select balance into next_balance from public.video_point_accounts where user_id = p_user;
    return coalesce(next_balance, 0);
  end if;
  return public.video_points_credit_internal(p_user, charged, 'refund', p_ref);
end; $$;

create or replace function public.video_points_version()
returns integer language sql stable security invoker set search_path = '' as $$ select 1; $$;

revoke all on function public.video_points_credit_internal(uuid, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.settle_video_points_v1(text, integer, text) from public, anon, authenticated;
revoke all on function public.video_points_grant_trial_v1(uuid, integer) from public, anon, authenticated;
revoke all on function public.video_points_debit_v1(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.video_points_refund_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.video_points_version() from public, anon, authenticated;
grant execute on function public.settle_video_points_v1(text, integer, text) to service_role;
grant execute on function public.video_points_grant_trial_v1(uuid, integer) to service_role;
grant execute on function public.video_points_debit_v1(uuid, integer, text) to service_role;
grant execute on function public.video_points_refund_v1(uuid, text) to service_role;
grant execute on function public.video_points_version() to service_role;

commit;
