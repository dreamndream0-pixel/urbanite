-- =============================================================
-- 預約 E3:每位名片主人連接自己的 LINE 官方帳號
-- - 金鑰(channel secret / access token)加密存在 integration_settings(key = SHOP_BKLINE:<business_id>),不放這裡
-- - bk_businesses.line_own / line_basic_id / line_name:公開資訊(預約頁要顯示「加入店家官方 LINE」)
-- - bk_line_links:顧客 / 店家本人在「這家店的官方帳號」的 LINE userId(不同 Provider 的 userId 不同,所以每家店分開記)
-- - bk_line_codes:綁定碼(在店家官方帳號傳「綁定 XXXXXX」完成綁定),30 分鐘有效
-- 可重複執行。
-- =============================================================
begin;

alter table public.bk_businesses add column if not exists line_own boolean not null default false;
alter table public.bk_businesses add column if not exists line_basic_id text not null default '';
alter table public.bk_businesses add column if not exists line_name text not null default '';

create table if not exists public.bk_line_links (
  business_id  uuid not null references public.bk_businesses(id) on delete cascade,
  user_id      uuid not null,
  role         text not null check (role in ('customer', 'owner')),
  line_user_id text not null,
  created_at   timestamptz not null default now(),
  primary key (business_id, user_id, role)
);
create index if not exists bk_line_links_line_idx on public.bk_line_links (business_id, line_user_id);
alter table public.bk_line_links enable row level security;

create table if not exists public.bk_line_codes (
  code        text primary key,
  business_id uuid not null references public.bk_businesses(id) on delete cascade,
  user_id     uuid not null,
  role        text not null check (role in ('customer', 'owner')),
  expires_at  timestamptz not null
);
create index if not exists bk_line_codes_user_idx on public.bk_line_codes (business_id, user_id, role);
alter table public.bk_line_codes enable row level security;

commit;
