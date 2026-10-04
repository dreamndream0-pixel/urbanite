-- =============================================================
-- 個人名片頁(urbanite.com.tw/@代稱)
-- 到 Supabase SQL Editor 執行整份；可重複執行。
-- 只透過後端 service_role 讀寫(RLS 開啟、不建立公開政策)。
-- =============================================================

create table if not exists public.profile_cards (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,                 -- 網址代稱(@後面)
  display_name  text not null default '',
  avatar_url    text not null default '',
  email         text not null default '',
  show_email    boolean not null default false,
  bio           text not null default '',
  show_bio      boolean not null default true,
  socials       jsonb not null default '[]',          -- [{ type, value }],依陣列順序顯示
  show_socials  boolean not null default true,
  tags          text[] not null default '{}',         -- 擅長領域 / 標籤(最多 3 個)
  show_tags     boolean not null default true,
  theme         jsonb not null default '{}',          -- 外觀設定(樣板、背景、按鈕樣式…)
  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.profile_card_blocks (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.profile_cards(id) on delete cascade,
  type        text not null check (type in ('link', 'text', 'image', 'product')),
  title       text not null default '',
  url         text not null default '',
  image       text not null default '',
  product_id  text not null default '',
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  clicks      integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profile_card_blocks_card_sort_idx on public.profile_card_blocks(card_id, sort_order);

alter table public.profile_cards enable row level security;
alter table public.profile_card_blocks enable row level security;
