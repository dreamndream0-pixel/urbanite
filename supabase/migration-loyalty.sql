-- =============================================================
-- 會員回饋金與消費等級。可重複執行,不刪資料。
-- 回饋金以「批次(lot)」記錄:每筆入帳一批、有到期日;折抵時先用快到期的。
-- 所有增減都寫進 credit_entries 流水帳;餘額 = 可用批次 remaining 加總。
-- =============================================================

-- 訂單:回饋金折抵、下單時等級與回饋率、完成時間
alter table public.orders
  add column if not exists credit_used integer not null default 0,
  add column if not exists credit_returned integer not null default 0,
  add column if not exists credit_rate numeric(5,2) not null default 0,
  add column if not exists tier_at_order text not null default '',
  add column if not exists completed_at timestamptz;

create or replace function public.set_order_completed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.order_status = 'COMPLETED' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end $$;
drop trigger if exists order_completed_at on public.orders;
create trigger order_completed_at before insert or update on public.orders
for each row execute function public.set_order_completed_at();
update public.orders set completed_at = created_at
  where order_status = 'COMPLETED' and completed_at is null;

-- 會員:保級中的等級(達到後保留到 tier_until)
alter table public.customers
  add column if not exists tier text not null default '',
  add column if not exists tier_until timestamptz;

create table if not exists public.credit_lots (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  user_id      uuid not null,
  source       text not null check (source in ('order', 'refund', 'adjust')),
  order_id     uuid references public.orders(id) on delete set null,
  amount       integer not null,
  remaining    integer not null,                 -- 可為負數:已用掉的回饋被追回(待扣回)
  status       text not null default 'pending' check (status in ('pending', 'active', 'expired', 'void')),
  available_at timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists credit_lots_order_earn on public.credit_lots (order_id) where source = 'order';
create index if not exists credit_lots_user on public.credit_lots (shop_id, user_id, status, expires_at);
create index if not exists credit_lots_due on public.credit_lots (status, available_at);

create table if not exists public.credit_entries (
  id         bigserial primary key,
  shop_id    uuid not null references public.shops(id) on delete cascade,
  user_id    uuid not null,
  lot_id     uuid references public.credit_lots(id) on delete set null,
  order_id   uuid references public.orders(id) on delete set null,
  kind       text not null check (kind in ('earn', 'redeem', 'return', 'expire', 'clawback', 'adjust')),
  amount     integer not null,
  note       text not null default '',
  actor      text not null default 'SYSTEM',
  created_at timestamptz not null default now()
);
create index if not exists credit_entries_user on public.credit_entries (shop_id, user_id, created_at desc);

alter table public.credit_lots enable row level security;
alter table public.credit_entries enable row level security;
revoke all on public.credit_lots, public.credit_entries from public, anon, authenticated;
grant select, insert, update, delete on public.credit_lots, public.credit_entries to service_role;
grant usage, select on sequence public.credit_entries_id_seq to service_role;

-- 可用餘額(含待扣回的負數)
create or replace function public.credit_balance(p_shop uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(remaining), 0)::integer from public.credit_lots
  where shop_id = p_shop and user_id = p_user and status = 'active';
$$;

-- 扣用回饋金(先用快到期的),不足時拋出 INSUFFICIENT_CREDIT。kind:redeem(結帳)/ adjust(後台扣除)
create or replace function public.consume_credit(p_shop uuid, p_user uuid, p_amount integer, p_kind text, p_order uuid, p_note text, p_actor text)
returns integer language plpgsql security definer set search_path = '' as $$
declare lot record; left_amount integer := p_amount; take integer;
begin
  if p_amount is null or p_amount <= 0 then return 0; end if;
  perform 1 from public.credit_lots where shop_id = p_shop and user_id = p_user and status = 'active' for update;
  if public.credit_balance(p_shop, p_user) < p_amount then raise exception 'INSUFFICIENT_CREDIT'; end if;
  for lot in select * from public.credit_lots
    where shop_id = p_shop and user_id = p_user and status = 'active' and remaining > 0
    order by expires_at nulls last, created_at loop
    exit when left_amount <= 0;
    take := least(lot.remaining, left_amount);
    update public.credit_lots set remaining = remaining - take where id = lot.id;
    insert into public.credit_entries(shop_id, user_id, lot_id, order_id, kind, amount, note, actor)
      values (p_shop, p_user, lot.id, p_order, p_kind, -take, coalesce(p_note, ''), coalesce(p_actor, 'SYSTEM'));
    left_amount := left_amount - take;
  end loop;
  if left_amount > 0 then raise exception 'INSUFFICIENT_CREDIT'; end if;
  return p_amount;
end $$;

-- 新增可用回饋金(退回、後台加發):一批新的 active,先抵掉待扣回的負數
create or replace function public.grant_credit(p_shop uuid, p_user uuid, p_amount integer, p_source text, p_kind text, p_order uuid, p_valid_days integer, p_note text, p_actor text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; debt record; left_amount integer := p_amount; pay integer;
begin
  if p_amount is null or p_amount <= 0 then return null; end if;
  for debt in select * from public.credit_lots where shop_id = p_shop and user_id = p_user and status = 'active' and remaining < 0 order by created_at for update loop
    exit when left_amount <= 0;
    pay := least(-debt.remaining, left_amount);
    update public.credit_lots set remaining = remaining + pay where id = debt.id;
    left_amount := left_amount - pay;
  end loop;
  insert into public.credit_lots(shop_id, user_id, source, order_id, amount, remaining, status, available_at, expires_at)
    values (p_shop, p_user, p_source, p_order, p_amount, left_amount, 'active', now(), now() + make_interval(days => greatest(p_valid_days, 1)))
    returning id into new_id;
  insert into public.credit_entries(shop_id, user_id, lot_id, order_id, kind, amount, note, actor)
    values (p_shop, p_user, new_id, p_order, p_kind, p_amount, coalesce(p_note, ''), coalesce(p_actor, 'SYSTEM'));
  if p_order is not null and p_kind = 'return' then
    update public.orders set credit_returned = credit_returned + p_amount where id = p_order;
  end if;
  return new_id;
end $$;

-- 待入帳的回饋到期 → 可用(有退貨處理中的訂單先不入帳)
create or replace function public.activate_credit_lots() returns integer
language plpgsql security definer set search_path = '' as $$
declare lot record; n integer := 0; debt record; left_amount integer; pay integer;
begin
  for lot in select l.* from public.credit_lots l
    where l.status = 'pending' and l.available_at <= now()
      and not exists (select 1 from public.returns r where r.order_id = l.order_id and r.status not in ('REJECTED', 'COMPLETED', 'REFUNDED'))
      and not exists (select 1 from public.orders o where o.id = l.order_id and o.fulfillment_status = 'RETURNING')
    for update skip locked loop
    if lot.amount <= 0 then
      update public.credit_lots set status = 'void', remaining = 0 where id = lot.id;
      continue;
    end if;
    left_amount := lot.amount;
    for debt in select * from public.credit_lots where shop_id = lot.shop_id and user_id = lot.user_id and status = 'active' and remaining < 0 order by created_at for update loop
      exit when left_amount <= 0;
      pay := least(-debt.remaining, left_amount);
      update public.credit_lots set remaining = remaining + pay where id = debt.id;
      left_amount := left_amount - pay;
    end loop;
    update public.credit_lots set status = 'active', remaining = left_amount where id = lot.id;
    insert into public.credit_entries(shop_id, user_id, lot_id, order_id, kind, amount, note)
      values (lot.shop_id, lot.user_id, lot.id, lot.order_id, 'earn', lot.amount, '訂單回饋入帳');
    n := n + 1;
  end loop;
  return n;
end $$;

-- 到期:可用回饋過期歸零
create or replace function public.expire_credit_lots() returns integer
language plpgsql security definer set search_path = '' as $$
declare lot record; n integer := 0;
begin
  for lot in select * from public.credit_lots where status = 'active' and expires_at < now() and remaining > 0 for update skip locked loop
    update public.credit_lots set status = 'expired', remaining = 0 where id = lot.id;
    insert into public.credit_entries(shop_id, user_id, lot_id, kind, amount, note)
      values (lot.shop_id, lot.user_id, lot.id, 'expire', -lot.remaining, '回饋金到期');
    n := n + 1;
  end loop;
  return n;
end $$;

-- 退款後重算訂單回饋:待入帳直接調整;已入帳則追回差額(用掉的部分變成待扣回)
create or replace function public.reduce_order_credit(p_order uuid, p_target integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare lot record; delta integer;
begin
  select * into lot from public.credit_lots where order_id = p_order and source = 'order' for update;
  if not found or p_target >= lot.amount then return 0; end if;
  delta := lot.amount - greatest(p_target, 0);
  if lot.status = 'pending' then
    update public.credit_lots set amount = greatest(p_target, 0), remaining = greatest(p_target, 0),
      status = case when p_target <= 0 then 'void' else 'pending' end where id = lot.id;
  elsif lot.status = 'active' then
    update public.credit_lots set amount = greatest(p_target, 0), remaining = remaining - delta where id = lot.id;
    insert into public.credit_entries(shop_id, user_id, lot_id, order_id, kind, amount, note)
      values (lot.shop_id, lot.user_id, lot.id, p_order, 'clawback', -delta, '訂單退款,追回回饋');
  end if;
  return delta;
end $$;

-- 到貨(宅配送達、超商已取貨)N 天後自動完成訂單;退貨、取消、退款中的不處理
create or replace function public.auto_complete_orders(p_days integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare o record; n integer := 0;
begin
  for o in select ord.* from public.orders ord
    where ord.fulfillment_status in ('DELIVERED', 'PICKED_UP')
      and coalesce(ord.order_status, '') not in ('COMPLETED', 'CANCELLED', 'CLOSED')
      and ord.status not in ('取消', '已取消', '退貨', '已完成')
      and coalesce(ord.cancel_status, '') not in ('REQUESTED', 'APPROVED')
      and coalesce(ord.payment_status, '') not in ('REFUNDED', 'PARTIALLY_REFUNDED')
      and not exists (select 1 from public.returns r where r.order_id = ord.id and r.status <> 'REJECTED')
      and coalesce(
        (select max(s.delivered_at) from public.shipments s where s.order_id = ord.id),
        (select max(h.created_at) from public.order_status_history h where h.order_id = ord.id and h.type = 'fulfillment' and h.to_status in ('DELIVERED', 'PICKED_UP')),
        ord.created_at
      ) < now() - make_interval(days => greatest(p_days, 1))
    for update skip locked loop
    insert into public.order_status_history(shop_id, order_id, type, from_status, to_status, note, created_by)
      values (o.shop_id, o.id, 'order', o.order_status, 'COMPLETED', '到貨 ' || p_days || ' 天自動完成', 'SYSTEM');
    update public.orders set status = '已完成', order_status = 'COMPLETED' where id = o.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.credit_balance(uuid, uuid), public.consume_credit(uuid, uuid, integer, text, uuid, text, text),
  public.grant_credit(uuid, uuid, integer, text, text, uuid, integer, text, text), public.activate_credit_lots(),
  public.expire_credit_lots(), public.reduce_order_credit(uuid, integer), public.auto_complete_orders(integer)
  from public, anon, authenticated;
grant execute on function public.credit_balance(uuid, uuid), public.consume_credit(uuid, uuid, integer, text, uuid, text, text),
  public.grant_credit(uuid, uuid, integer, text, text, uuid, integer, text, text), public.activate_credit_lots(),
  public.expire_credit_lots(), public.reduce_order_credit(uuid, integer), public.auto_complete_orders(integer)
  to service_role;

-- 到期提醒只寄一次
alter table public.credit_lots add column if not exists expiry_notified_at timestamptz;
