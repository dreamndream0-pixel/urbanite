-- =============================================================
-- 首頁輪播圖(Hero Banner)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

create table if not exists public.banners (
  id         uuid primary key default gen_random_uuid(),
  image      text not null,                 -- 圖片網址(上傳到 Supabase Storage)
  link       text default '',               -- 點擊後前往的網址(可空)
  title      text default '',               -- 選填說明文字
  active     boolean not null default true, -- 是否顯示
  sort_order integer not null default 0,    -- 排序(小的在前)
  created_at timestamptz not null default now()
);

create index if not exists banners_sort_idx on public.banners (sort_order);

alter table public.banners enable row level security;

-- 前台需要公開讀得到啟用中的輪播圖
drop policy if exists "banners public read" on public.banners;
create policy "banners public read"
  on public.banners for select
  using (true);
