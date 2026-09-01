-- 頁尾三個社群按鈕:可從後台設定圖片與連結
alter table public.site_settings
  add column if not exists footer_social_links jsonb not null default '[]'::jsonb;
