-- 名片方案限時免費活動:{ enabled, tier, start, end, note }。可重複執行。
alter table public.site_settings add column if not exists card_promo jsonb not null default '{}'::jsonb;
