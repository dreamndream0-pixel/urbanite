-- =============================================================
-- Urbanite 購物車 — 資料庫結構
-- 使用方式:到 Supabase 後台 → SQL Editor → 貼上整份 → Run
-- 重複執行是安全的(使用 if not exists / on conflict)。
-- =============================================================

-- ---------- 商品表 ----------
create table if not exists public.products (
  id             text primary key,              -- 商品代碼,例如 love-set
  name           text not null,                 -- 商品名稱
  tagline        text default '',               -- 一句話介紹
  price          integer not null,              -- 售價(整數,新台幣)
  original_price integer,                        -- 原價(劃線價,可空)
  inventory      integer not null default 0,    -- 庫存數量
  status         text not null default '上架中',-- 狀態:上架中 / 加購品 / 已下架
  image                      text default '',               -- 主圖網址
  images                     text[] not null default '{}',   -- 商品圖片,最多 10 張由後台限制
  available_payment_methods  jsonb not null default '[]',   -- 此商品可用付款方式
  available_shipping_methods jsonb not null default '[]',   -- 此商品可用物流方式
  colors                     text[] default '{}',           -- 可選顏色
  sizes                      text[] default '{}',           -- 可選尺寸
  is_featured                boolean not null default false,-- 是否為首頁主打
  sort_order                 integer not null default 0,    -- 排序(小的在前)
  created_at                 timestamptz not null default now()
);

-- ---------- 訂單表 ----------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text unique not null,           -- 對客人顯示的單號,例如 UB-24081
  customer_name text not null,                  -- 收件人姓名
  email         text not null,                  -- 客人 Email
  items         jsonb not null default '[]',    -- 購買品項明細(名稱/變體/單價/數量)
  subtotal      integer not null default 0,     -- 小計
  shipping      integer not null default 0,     -- 運費
  shipping_method text default '',              -- 送貨方式
  payment_method  text default '',              -- 付款方式
  total         integer not null default 0,     -- 總計
  status        text not null default '待出貨', -- 待出貨 / 備貨中 / 已出貨 / 已取消
  paid          boolean not null default false, -- 是否已付款
  created_at    timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- ---------- 開啟 Row Level Security ----------
-- 資料只透過我們的後端 API(使用 service_role 金鑰)存取,
-- 開啟 RLS 是為了擋掉任何人拿 anon 金鑰直接讀寫資料庫。
alter table public.products enable row level security;
alter table public.orders   enable row level security;

-- 前台需要「公開讀得到上架商品」,所以給 products 一條公開讀取政策。
drop policy if exists "products public read" on public.products;
create policy "products public read"
  on public.products for select
  using (true);

-- orders 不開放任何公開存取;所有讀寫都走後端 service_role(自動繞過 RLS)。

-- ---------- 種子資料(現有的三個商品)----------
insert into public.products
  (id, name, tagline, price, original_price, inventory, status, image, colors, sizes, is_featured, sort_order)
values
  ('love-set',   'LOVE LOVE LOVE 禮盒', '晚安前的小儀式，柔軟、香氣與心意一次備齊。', 1680, 1980, 38, '上架中',
   'https://images.unsplash.com/photo-1617325247661-675ab4b64b18?auto=format&fit=crop&w=1200&q=80',
   '{Rose,Ivory,Black}', '{XS,S,M,L}', true, 1),
  ('silk-slip',  '雲朵緞面睡衣',       '輕薄垂墜的日常款，適合單穿或搭配外袍。',     1280, 1480, 24, '上架中',
   'https://images.unsplash.com/photo-1592878849122-facb97520f9e?auto=format&fit=crop&w=1200&q=80',
   '{Rose,Ivory,Black}', '{XS,S,M,L}', false, 2),
  ('scent-card', '月光香氛卡',         '放進衣櫃、抽屜或禮盒，留下乾淨微甜的香氣。', 320,  380,  91, '加購品',
   'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=80',
   '{Rose}', '{}', false, 3)
on conflict (id) do nothing;

-- ---------- 網站設定 ----------
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
  payment_methods      jsonb not null default '["綠界金流","Line Pay","Apple Pay","取貨付款","轉帳匯款"]',
  shipping_methods     jsonb not null default '["綠界物流-超商取貨","綠界物流-宅配","7-11 取貨付款","全家 取貨付款"]',
  enabled_payment_methods  jsonb not null default '["綠界金流","Line Pay","Apple Pay","取貨付款","轉帳匯款"]',
  enabled_shipping_methods jsonb not null default '["綠界物流-超商取貨","綠界物流-宅配","7-11 取貨付款","全家 取貨付款"]',
  updated_at           timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;
drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read"
  on public.site_settings for select
  using (true);
