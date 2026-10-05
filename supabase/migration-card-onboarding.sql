-- =============================================================
-- 名片服務:第一次建立名片時先設定暱稱與網址。可重複執行。
-- 既有名片視為已完成;新建立的名片 onboarded = false
-- =============================================================
alter table public.profile_cards
  add column if not exists onboarded boolean not null default true;

-- 推薦人(填寫時的對方網址代稱)
alter table public.profile_cards
  add column if not exists referred_by text not null default '';
