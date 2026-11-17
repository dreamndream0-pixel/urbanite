-- =============================================================
-- 店家功能開關(平台管理員在「店家管理」設定)。可重複執行,不刪資料。
-- features = { pos, multi_location, invoice, staff } 的覆寫;沒設定的項目依方案預設(lib/shop-features.ts)
-- =============================================================
alter table public.shops add column if not exists features jsonb not null default '{}'::jsonb;
