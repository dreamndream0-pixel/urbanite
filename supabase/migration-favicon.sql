-- 店家網頁頁籤圖示(favicon)。可重複執行。空白 = 使用預設 URBANITE 圖示
alter table public.site_settings add column if not exists favicon_url text not null default '';
