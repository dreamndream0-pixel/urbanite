-- =============================================================
-- 名片服務四個等級:U Free / U Plus / U Pro / U Max。可重複執行。
-- card_subscriptions.plan:plus / pro / max(到期前有效,過期即 U Free)
-- =============================================================

alter table public.card_payments
  add column if not exists tier text not null default 'plus';

alter table public.card_subscriptions alter column plan set default 'plus';
update public.card_subscriptions set plan = 'plus'
where plan = 'pro'
  and not exists (select 1 from public.card_payments p where p.user_id = card_subscriptions.user_id and p.tier = 'pro');
