-- 商品分類圖片(首頁分類導覽顯示圓形圖片)。可重複執行。
alter table public.categories add column if not exists image text not null default '';
