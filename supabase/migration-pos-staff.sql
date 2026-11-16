-- =============================================================
-- POS 員工帳號與權限。可重複執行,不刪資料。
-- 員工用自己的會員帳號登入(Email 要和這裡登記的一樣),只能進 POS、不能進後台;
-- 能做什麼由 permissions 決定,location_ids 限制可以用哪些據點(空 = 全部)。
-- =============================================================
create table if not exists public.pos_staff (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  email        text not null,                       -- 小寫
  name         text not null default '',
  -- ['discount','refund','session','orders','settings','barcode']
  permissions  jsonb not null default '[]'::jsonb,
  location_ids jsonb not null default '[]'::jsonb,  -- 可用的據點 id;空陣列 = 全部
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index if not exists pos_staff_shop_email_key on public.pos_staff (shop_id, email);

alter table public.pos_staff enable row level security;
revoke all on public.pos_staff from public, anon, authenticated;
grant select, insert, update, delete on public.pos_staff to service_role;
