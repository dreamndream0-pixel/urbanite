-- =============================================================
-- 訂單系統強化(第一階段 + 第二階段)
--   第一階段:orders 增加三套狀態欄位(訂單/付款/物流)
--   第二階段:付款、物流、物流歷程、訂單狀態歷程 四張關聯表
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- 商品品項(items jsonb)的 sku / item_status 由後端程式碼在下單時寫入,
-- 不需要改資料表結構。
-- =============================================================

-- ---------- 第一階段:三套狀態欄位 ----------
-- order_status       訂單狀態  PENDING / CONFIRMED / PROCESSING / COMPLETED / CANCELLED / CLOSED
-- payment_status     付款狀態  UNPAID / PENDING / PAID / PARTIALLY_REFUNDED / REFUNDED / FAILED / CANCELLED
-- fulfillment_status 物流狀態  UNFULFILLED / PREPARING / READY_TO_SHIP / SHIPPED / IN_TRANSIT / DELIVERED / RETURNING / RETURNED
alter table public.orders
  add column if not exists order_status       text not null default 'PENDING',
  add column if not exists payment_status     text not null default 'UNPAID',
  add column if not exists fulfillment_status text not null default 'UNFULFILLED';

-- 從既有的中文 status / paid 回填三套狀態(可重複執行,結果一致)
update public.orders set
  payment_status = case when paid then 'PAID' else 'UNPAID' end,
  order_status = case status
    when '尚未付款' then 'PENDING'
    when '待出貨'   then 'CONFIRMED'
    when '已出貨'   then 'PROCESSING'
    when '已完成'   then 'COMPLETED'
    when '取消'     then 'CANCELLED'
    when '退貨'     then 'CONFIRMED'
    else 'CONFIRMED'
  end,
  fulfillment_status = case status
    when '已出貨' then 'SHIPPED'
    when '已完成' then 'DELIVERED'
    when '退貨'   then 'RETURNED'
    else 'UNFULFILLED'
  end;

-- ---------- 第二階段:付款紀錄 ----------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  provider        text default '',            -- ECPay / LINE Pay / NewebPay ...
  payment_method  text default '',            -- credit_card / atm / cod ...
  transaction_id  text default '',            -- 金流商交易編號
  amount          integer not null default 0,
  status          text not null default 'PENDING', -- PENDING / PAID / FAILED / CANCELLED / REFUNDED
  failure_code    text default '',
  failure_message text default '',
  raw_response    jsonb,
  requested_at    timestamptz default now(),
  paid_at         timestamptz,
  failed_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments (order_id);

-- ---------- 第二階段:物流(出貨) ----------
create table if not exists public.shipments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  provider        text default '',            -- 7-ELEVEN / FamilyMart / 黑貓 ...
  shipping_method text default '',            -- STORE_PICKUP / HOME_DELIVERY
  tracking_number text default '',
  recipient_name  text default '',
  recipient_phone text default '',
  status          text not null default 'PREPARING', -- PREPARING / READY_TO_SHIP / SHIPPED / IN_TRANSIT / DELIVERED
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists shipments_order_idx on public.shipments (order_id);

-- ---------- 第二階段:物流歷程 ----------
create table if not exists public.shipment_events (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  status      text default '',
  description text default '',
  location    text default '',
  event_at    timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists shipment_events_shipment_idx on public.shipment_events (shipment_id);

-- ---------- 第二階段:訂單狀態歷程 ----------
create table if not exists public.order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  type       text not null default 'order', -- order / payment / fulfillment
  from_status text default '',
  to_status   text default '',
  note        text default '',
  created_by  text default 'SYSTEM',        -- SYSTEM / ECPay / 後台管理員 ...
  created_at  timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------- RLS:全部只走後端 service_role(與 orders 一致,不開放公開存取) ----------
alter table public.payments             enable row level security;
alter table public.shipments            enable row level security;
alter table public.shipment_events      enable row level security;
alter table public.order_status_history enable row level security;
