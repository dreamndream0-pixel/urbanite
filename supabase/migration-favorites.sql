-- =============================================================
-- 會員收藏清單(收藏紀錄在帳號裡)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

create table if not exists public.favorites (
  user_id    uuid not null,               -- 對應登入帳號(auth.users)
  product_id text not null,               -- 收藏的商品代碼
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;
-- 收藏只透過後端 API(service_role,會先驗證登入者)存取。
