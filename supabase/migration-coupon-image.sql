-- 優惠券左側樣式圖:preset-N 預設漸層 key,或上傳照片的網址
alter table if exists discounts add column if not exists image text;
