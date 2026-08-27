-- =============================================================
-- 分類管理(後台可自行增減分類)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- 這份已包含商品的 category 欄位,跑這一份就好。
-- =============================================================

-- 1) 商品的分類欄位(存分類的 slug)
alter table public.products
  add column if not exists category text default '';

update public.products set category = 'new'    where id = 'love-set'   and (category is null or category = '');
update public.products set category = 'winter' where id = 'silk-slip'  and (category is null or category = '');
update public.products set category = 'acc'    where id = 'scent-card' and (category is null or category = '');

-- 2) 分類資料表
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,   -- 英文代碼,商品的 category 會對應它
  name       text not null,          -- 中文名稱,例如「洋裝」
  en         text default '',        -- 英文顯示,例如「DRESS」
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "categories public read" on public.categories;
create policy "categories public read"
  on public.categories for select
  using (true);

-- 3) 種子:現有 6 個分類
insert into public.categories (slug, name, en, sort_order) values
  ('new',    '新品', 'NEW',    1),
  ('spring', '春',   'SPRING', 2),
  ('summer', '夏',   'SUMMER', 3),
  ('autumn', '秋',   'AUTUMN', 4),
  ('winter', '冬',   'WINTER', 5),
  ('acc',    '飾品', 'ACC',    6)
on conflict (slug) do nothing;
