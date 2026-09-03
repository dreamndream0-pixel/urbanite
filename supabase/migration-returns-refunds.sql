-- =============================================================
-- 退貨(§15-16)與退款(§17)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- 退貨品項以 jsonb 快照存於 returns.items(與 orders.items 一致)
-- =============================================================

-- ---------- 退貨 ----------
-- status: REQUESTED(申請中) / APPROVED(已核准待寄回) / REJECTED(已婉拒)
--         / RECEIVED(已收到退貨) / COMPLETED(退款完成)
create table if not exists public.returns (
  id            uuid primary key default gen_random_uuid(),
  return_no     text unique not null,
  order_id      uuid not null references public.orders(id) on delete cascade,
  user_id       uuid,
  reason        text default '',
  status        text not null default 'REQUESTED',
  items         jsonb not null default '[]',   -- [{index, name, variant, sku, price, quantity, reason}]
  refund_amount integer not null default 0,
  response      text default '',               -- 賣家回覆
  restocked     boolean not null default false,
  requested_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  received_at   timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists returns_order_idx on public.returns (order_id, created_at);

-- ---------- 退款 ----------
-- status: PENDING / PROCESSING / COMPLETED
create table if not exists public.refunds (
  id                uuid primary key default gen_random_uuid(),
  refund_no         text unique not null,
  order_id          uuid not null references public.orders(id) on delete cascade,
  return_id         uuid references public.returns(id) on delete set null,
  amount            integer not null default 0,
  reason            text default '',
  status            text not null default 'COMPLETED',
  provider_refund_id text default '',
  created_by        text default '',
  created_at        timestamptz not null default now()
);
create index if not exists refunds_order_idx on public.refunds (order_id, created_at);

-- ---------- RLS:只走後端 service_role(與 orders 一致) ----------
alter table public.returns enable row level security;
alter table public.refunds enable row level security;
