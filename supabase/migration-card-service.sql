-- =============================================================
-- 個人名片獨立服務:每位會員一張名片、免費/付費方案、方案付款。可重複執行。
-- =============================================================

-- 名片擁有者(會員帳號)
alter table public.profile_cards
  add column if not exists owner_user_id uuid;
create unique index if not exists profile_cards_owner_key on public.profile_cards (owner_user_id) where owner_user_id is not null;

-- 現有的店家名片歸給主帳號
update public.profile_cards
set owner_user_id = (select id from auth.users where email = 'dreamndream0@gmail.com' limit 1)
where owner_user_id is null and slug = 'urbanite';

-- 付費方案:到期日之前為 Pro
create table if not exists public.card_subscriptions (
  user_id    uuid primary key,
  plan       text not null default 'pro',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- 方案付款紀錄(藍新)
create table if not exists public.card_payments (
  id         uuid primary key default gen_random_uuid(),
  order_no   text not null unique,
  user_id    uuid not null,
  period     text not null,              -- month / year
  amount     int not null,
  status     text not null default 'pending',  -- pending / paid / failed
  trade_no   text not null default '',
  paid_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists card_payments_user_idx on public.card_payments (user_id);

alter table public.card_subscriptions enable row level security;
alter table public.card_payments enable row level security;
