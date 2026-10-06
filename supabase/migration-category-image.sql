-- 商品分類圖片(首頁分類導覽顯示圓形圖片)。可重複執行。
alter table public.categories add column if not exists image text not null default '';

-- 首頁分類圖片樣式:circle 圓形 / square 方形 / cutout 去背 PNG
alter table public.site_settings add column if not exists category_image_style text not null default 'circle';
