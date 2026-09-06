-- 會員「優惠券及購物金」頁 hero 右側背景圖(後台可上傳)
alter table if exists site_settings add column if not exists coupon_hero_image text;
