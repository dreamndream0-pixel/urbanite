-- =============================================================
-- 顧客資料表:登入(註冊)時就建檔
-- =============================================================

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique,               -- 對應登入帳號(auth.users)
  email      text,
  name       text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;
-- 顧客資料只透過後端 API(service_role)存取
