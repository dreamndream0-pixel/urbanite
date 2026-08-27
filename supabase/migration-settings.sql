-- =============================================================
-- 網站設定 + 圖片儲存(Logo 上傳用)
-- =============================================================

-- 網站設定表(只會有一列,id 固定為 1)
create table if not exists public.site_settings (
  id         integer primary key default 1,
  logo_url   text default '',
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;
drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read"
  on public.site_settings for select
  using (true);

-- 公開的圖片儲存空間(存 Logo 等)
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;
