-- =============================================================
-- 商品多圖:每個商品可存放多張圖片(最多 10 張)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

-- 商品加上「多圖」欄位(字串陣列,存圖片網址)
alter table public.products
  add column if not exists images text[] not null default '{}';

-- 把既有的主圖補進 images 陣列(尚未有多圖的商品才處理)
update public.products
  set images = array[image]
  where image is not null
    and image <> ''
    and (images is null or array_length(images, 1) is null);
