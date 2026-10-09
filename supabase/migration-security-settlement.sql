-- Apply before deploying the RPC-only subscription settlement code.
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
  -- Serializes different payments for one account, including its first subscription.
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
create or replace function public.card_settlement_version()
returns integer language sql stable security invoker set search_path = '' as $$ select 1; $$;
revoke all on function public.card_settlement_version() from public, anon, authenticated;
grant execute on function public.card_settlement_version() to service_role;
commit;
