-- =============================================================
-- 1) 僅門市銷售的商品  2) POS 員工改用「員工編號 + 密碼」登入。可重複執行,不刪資料。
-- =============================================================

-- 僅門市銷售:官網看不到、不能下單,只有 POS 可以賣
alter table public.products add column if not exists store_only boolean not null default false;

-- POS 員工:後台建立員工編號與密碼,不再用會員帳號(Email / Google)登入
alter table public.pos_staff add column if not exists code text not null default '';
alter table public.pos_staff add column if not exists pin_hash text not null default '';       -- scrypt 雜湊,不存明碼
alter table public.pos_staff add column if not exists failed_attempts integer not null default 0;
alter table public.pos_staff add column if not exists locked_until timestamptz;                -- 連續輸錯後暫時鎖定
alter table public.pos_staff add column if not exists last_login_at timestamptz;
alter table public.pos_staff alter column email drop not null;
alter table public.pos_staff alter column email set default '';
drop index if exists public.pos_staff_shop_email_key;
create unique index if not exists pos_staff_shop_code_key on public.pos_staff (shop_id, lower(code)) where code <> '';
