-- =============================================================
-- 顏色對應圖片:{ 顏色名稱: 圖片網址 }
-- =============================================================

alter table public.products
  add column if not exists color_images jsonb not null default '{}';
