-- =============================================================
-- 個人名片頁 第 2~4 階段:外觀 / SEO / 更多區塊 / 限時顯示 / 數據分析
-- 需先執行過 migration-profile-card.sql。可重複執行。
-- =============================================================

alter table public.profile_cards
  add column if not exists seo_title        text not null default '',
  add column if not exists seo_description  text not null default '',
  add column if not exists seo_image        text not null default '',
  add column if not exists show_footer_logo boolean not null default true;

alter table public.profile_card_blocks
  add column if not exists start_at timestamptz,
  add column if not exists end_at   timestamptz;

-- 區塊類型:新增 影片 / LINE / 分隔線
alter table public.profile_card_blocks drop constraint if exists profile_card_blocks_type_check;
alter table public.profile_card_blocks
  add constraint profile_card_blocks_type_check
  check (type in ('link', 'text', 'image', 'product', 'video', 'line', 'divider'));

-- 瀏覽與點擊紀錄(只記次數與來源,不記個資)
create table if not exists public.profile_card_events (
  id         bigint generated always as identity primary key,
  card_id    uuid not null references public.profile_cards(id) on delete cascade,
  block_id   uuid references public.profile_card_blocks(id) on delete set null,
  type       text not null check (type in ('view', 'click')),
  source     text not null default 'direct',
  created_at timestamptz not null default now()
);

create index if not exists profile_card_events_card_time_idx on public.profile_card_events(card_id, created_at desc);

alter table public.profile_card_events enable row level security;
