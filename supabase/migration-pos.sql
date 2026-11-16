-- =============================================================
-- POS 門市結帳。可重複執行,不刪資料。
-- POS 銷售一樣寫進 orders(channel = 'pos'),扣庫存、寫 stock_movements,後台訂單 / 庫存 / 報表共用同一份資料。
-- =============================================================

-- 訂單來源:online(官網)/ pos(門市)
alter table public.orders add column if not exists channel text not null default 'online';
-- POS 明細:{ cashier, payments:[{method,amount}], tendered, change, manual_discount, refunds:[...] }
alter table public.orders add column if not exists pos jsonb;
alter table public.orders add column if not exists pos_session_id uuid;
create index if not exists orders_shop_channel_created_idx on public.orders (shop_id, channel, created_at desc);
create index if not exists orders_pos_session_idx on public.orders (pos_session_id) where pos_session_id is not null;

-- 商品條碼(沒有規格的商品;有規格的條碼放在 variants[].barcode)
alter table public.products add column if not exists barcode text not null default '';

-- POS 設定:付款方式、收據抬頭 / 頁尾、是否允許庫存不足仍可銷售
alter table public.site_settings add column if not exists pos_settings jsonb;

-- 班別(開班 → 交班):記錄零用金、現金收支、交班點鈔
create table if not exists public.pos_sessions (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  status        text not null default 'open' check (status in ('open', 'closed')),
  opened_by     text not null default '',
  opened_at     timestamptz not null default now(),
  opening_cash  integer not null default 0,
  -- [{ at, type:'in'|'out', amount, note, by }]
  cash_moves    jsonb not null default '[]'::jsonb,
  -- [{ at, order_no, amount, method, by }]:這一班退出去的款項(訂單可能是別班賣的)
  refunds       jsonb not null default '[]'::jsonb,
  closed_by     text not null default '',
  closed_at     timestamptz,
  counted_cash  integer,
  expected_cash integer,
  difference    integer,
  summary       jsonb,
  note          text not null default ''
);
create index if not exists pos_sessions_shop_opened_idx on public.pos_sessions (shop_id, opened_at desc);
-- 每家店同時只有一個營業中的班別
create unique index if not exists pos_sessions_one_open on public.pos_sessions (shop_id) where status = 'open';

alter table public.pos_sessions enable row level security;
revoke all on public.pos_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.pos_sessions to service_role;
-- 只透過後端 API(service_role)存取。

-- POS 訂單當場成交,不寄訂單通知(信件 / LINE)
create or replace function public.enqueue_order_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare events text[] := '{}'; e text;
begin
  if new.channel = 'pos' then return new; end if;
  if not exists(select 1 from public.integration_settings where key = 'SHOP_ORDER_NOTIFICATIONS:' || new.shop_id::text) then return new; end if;
  if tg_op = 'INSERT' then
    events := array_append(events,'created');
    if new.payment_status = 'PAID' then events := array_append(events,'paid'); end if;
  else
    if new.fulfillment_status is distinct from old.fulfillment_status then
      if new.fulfillment_status in ('PREPARING','READY_TO_SHIP') and old.fulfillment_status not in ('PREPARING','READY_TO_SHIP') then events := array_append(events,'ready'); end if;
      if new.fulfillment_status in ('SHIPPED','IN_TRANSIT') and old.fulfillment_status not in ('SHIPPED','IN_TRANSIT') then events := array_append(events,'shipped'); end if;
      if new.fulfillment_status in ('AT_STORE','DELIVERED') and old.fulfillment_status not in ('AT_STORE','DELIVERED','PICKED_UP') then events := array_append(events,'arrived'); end if;
      if new.fulfillment_status = 'PICKED_UP' then events := array_append(events,'picked_up'); end if;
    end if;
    if new.payment_status is distinct from old.payment_status then
      if new.payment_status = 'PAID' then events := array_append(events,'paid'); end if;
      if new.payment_status in ('REFUNDED','PARTIALLY_REFUNDED') then events := array_append(events,'refunded'); end if;
    end if;
    if new.order_status is distinct from old.order_status then
      if new.order_status = 'COMPLETED' then events := array_append(events,'completed'); end if;
      if new.order_status = 'CANCELLED' then events := array_append(events,'cancelled'); end if;
    end if;
  end if;
  foreach e in array events loop
    insert into public.order_notification_jobs(shop_id,order_id,event,audience,channel)
      select new.shop_id,new.id,e,a,c from unnest(array['buyer','seller']) a cross join unnest(array['email','line']) c;
  end loop;
  return new;
end $$;
revoke all on function public.enqueue_order_notifications() from public, anon, authenticated;
