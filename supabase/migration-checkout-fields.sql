-- 結帳自訂欄位:店家在「系統設定 → 結帳欄位」新增(可設必填 / 選填、啟用 / 停用、套用條件)
-- site_settings.checkout_fields:欄位定義;orders.custom_fields:顧客填的答案 [{id,label,value}]。可重複執行。
alter table public.site_settings add column if not exists checkout_fields jsonb not null default '[]';
alter table public.orders add column if not exists custom_fields jsonb not null default '[]';
