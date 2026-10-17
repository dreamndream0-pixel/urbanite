-- =============================================================
-- 名片方案升級:剩餘天數依月費比例折算到新方案(不再浪費已付的時間)
-- 例:U Pro 剩 365 天升級 U Max → 365 × 399 / 699 ≈ 208 天加到 U Max 的期間
-- 同方案續約接在到期日之後;較低方案在有效期間內由結帳頁擋下(這裡保留原本的保護)
-- 需先執行過 migration-security-settlement.sql。可重複執行。
-- =============================================================
begin;
create or replace function public.settle_card_payment_v1(p_order_no text, p_amount integer, p_trade_no text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  payment public.card_payments%rowtype;
  subscription public.card_subscriptions%rowtype;
  days integer;
  next_plan text;
  next_expiry timestamptz;
  current_rank integer;
  paid_rank integer;
  credit_days numeric;
  month_price constant jsonb := '{"plus": 39, "pro": 399, "max": 699}';
begin
  if p_amount is null or p_amount <= 0 or p_trade_no is null or length(trim(p_trade_no)) = 0 then
    raise exception 'INVALID_PAYMENT';
  end if;
  select * into payment from public.card_payments where order_no = p_order_no for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if payment.amount <> p_amount then raise exception 'AMOUNT_MISMATCH'; end if;
  if payment.status = 'paid' then
    if payment.trade_no <> '' and payment.trade_no <> p_trade_no then raise exception 'TRADE_MISMATCH'; end if;
    return true;
  end if;
  if payment.status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;
  if payment.period not in ('month', 'year') or payment.tier not in ('plus', 'pro', 'max') then
    raise exception 'INVALID_PLAN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(payment.user_id::text, 0));
  select * into subscription from public.card_subscriptions where user_id = payment.user_id for update;
  days := case payment.period when 'month' then 31 else 366 end;
  paid_rank := case payment.tier when 'plus' then 1 when 'pro' then 2 else 3 end;
  current_rank := case subscription.plan when 'plus' then 1 when 'pro' then 2 when 'max' then 3 else 0 end;
  next_plan := payment.tier;
  next_expiry := now() + pg_catalog.make_interval(days => days);
  if subscription.expires_at > now() then
    if subscription.plan = payment.tier then
      next_expiry := subscription.expires_at + pg_catalog.make_interval(days => days);
    elsif current_rank > paid_rank then
      next_plan := subscription.plan;
      next_expiry := greatest(subscription.expires_at, next_expiry);
    else
      -- 升級:舊方案剩餘時間依月費比例換成新方案的天數
      credit_days := extract(epoch from (subscription.expires_at - now())) / 86400.0
        * (month_price ->> subscription.plan)::numeric / (month_price ->> payment.tier)::numeric;
      next_expiry := next_expiry + pg_catalog.make_interval(secs => floor(credit_days * 86400));
    end if;
  end if;
  insert into public.card_subscriptions(user_id, plan, expires_at, updated_at)
    values(payment.user_id, next_plan, next_expiry, now())
    on conflict(user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, updated_at = excluded.updated_at;
  update public.card_payments set status = 'paid', paid_at = now(), trade_no = p_trade_no where id = payment.id;
  return true;
end;
$$;
revoke all on function public.settle_card_payment_v1(text, integer, text) from public, anon, authenticated;
grant execute on function public.settle_card_payment_v1(text, integer, text) to service_role;
commit;
