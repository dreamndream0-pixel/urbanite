-- =============================================================
-- 會員綁定 LINE 官方帳號(Messaging API 的 userId)。可重複執行。
-- 綁定後可在 LINE 查詢訂單、優惠券、購物金與會員資料。
-- =============================================================

alter table public.customers
  add column if not exists line_user_id text,
  add column if not exists line_display_name text default '',
  add column if not exists line_picture_url text default '',
  add column if not exists line_bound_at timestamptz;

-- 一個 LINE 只能綁一個會員
create unique index if not exists customers_line_user_id_key
  on public.customers (line_user_id) where line_user_id is not null;
