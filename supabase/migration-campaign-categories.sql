-- 促銷活動頁專屬分類:campaign_id 有值的分類只屬於該活動頁,不出現在主站分類。可重複執行。
alter table public.categories add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;
create index if not exists categories_campaign_idx on public.categories (campaign_id);
alter table public.campaigns add column if not exists hero_ratio text not null default 'portrait'; -- 活動頁輪播圖比例:portrait 4:5 / square 1:1 / wide 16:9
