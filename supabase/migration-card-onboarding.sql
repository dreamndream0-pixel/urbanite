-- =============================================================
-- 名片服務:第一次建立名片時先設定暱稱與網址。可重複執行。
-- 既有名片視為已完成;新建立的名片 onboarded = false
-- =============================================================
alter table public.profile_cards
  add column if not exists onboarded boolean not null default true;

-- 推薦人(填寫時的對方網址代稱)
alter table public.profile_cards
  add column if not exists referred_by text not null default '';

-- 推薦獎勵:referred_by 存推薦人的名片 id;每滿 5 位送 1 個月 U Plus
alter table public.profile_cards
  add column if not exists referral_rewards int not null default 0;
create index if not exists profile_cards_referred_by_idx on public.profile_cards (referred_by);
