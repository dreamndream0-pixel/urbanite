-- 訂單完成頁文字(系統設定 → 結帳設定):標題、說明、訪客提醒、付款提醒、LINE 區塊、按鈕。可重複執行。
alter table public.site_settings add column if not exists order_complete_texts jsonb not null default '{}';
