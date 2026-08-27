-- =============================================================
-- 客人會員:訂單關聯到登入使用者
-- =============================================================

-- 訂單加上「下單者」欄位(登入客人下單時記錄;訪客下單為 null)
alter table public.orders
  add column if not exists user_id uuid;

create index if not exists orders_user_id_idx on public.orders (user_id);
