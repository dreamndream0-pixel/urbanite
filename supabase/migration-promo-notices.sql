-- 促銷管理 → 活動管理:商品頁促銷文字(例如「全店消費滿 $2,000 免運費」)。可重複執行。
-- 格式:[{ "id": "...", "text": "...", "active": true }];null = 使用預設的免運文字(lib/promo-notices.ts)
alter table public.site_settings add column if not exists promo_notices jsonb;
