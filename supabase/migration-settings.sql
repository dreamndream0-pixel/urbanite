-- =============================================================
-- 網站設定 + 圖片儲存(Logo 上傳用)
-- =============================================================

-- 網站設定表(只會有一列,id 固定為 1)
create table if not exists public.site_settings (
  id                   integer primary key default 1,
  logo_url             text default '',
  footer_about_links   jsonb not null default '["優惠資訊 / Coupon","商店介紹 / Introduction","與我們合作 / Cooperation"]',
  footer_service_links jsonb not null default '["加入會員享折扣 / VIP","挑選尺寸 / About Size","購物須知 / How To Buy","退換貨政策 / After-sales Service","使用者條款 / Terms","隱私權政策 / Privacy"]',
  footer_service_hours text default '上班日 11:00 - 18:00',
  footer_email         text default '',
  footer_company_name  text default '',
  footer_tax_id        text default '',
  footer_instagram_url text default '',
  footer_line_url      text default '',
  updated_at           timestamptz default now(),
  constraint single_row check (id = 1)
);

alter table public.site_settings
  add column if not exists footer_about_links jsonb not null default '["優惠資訊 / Coupon","商店介紹 / Introduction","與我們合作 / Cooperation"]',
  add column if not exists footer_service_links jsonb not null default '["加入會員享折扣 / VIP","挑選尺寸 / About Size","購物須知 / How To Buy","退換貨政策 / After-sales Service","使用者條款 / Terms","隱私權政策 / Privacy"]',
  add column if not exists footer_service_hours text default '上班日 11:00 - 18:00',
  add column if not exists footer_email text default '',
  add column if not exists footer_company_name text default '',
  add column if not exists footer_tax_id text default '',
  add column if not exists footer_instagram_url text default '',
  add column if not exists footer_line_url text default '';

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
