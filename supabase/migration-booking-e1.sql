-- =============================================================
-- 預約 E1
-- 1. 人員歸屬分店:bk_staff.branch_ids(空 = 所有分店都可排)
-- 2. 顧客回報付款:可選「訂金」或「全額」,填末 5 碼、轉帳時間、戶名;
--    待付訂金的預約 → 狀態改為「已回報」;已成立但還沒付清的預約 → 也可以預先付清
-- 需先執行過 migration-booking-b.sql、-d3.sql。可重複執行。
-- =============================================================
begin;

alter table public.bk_staff add column if not exists branch_ids uuid[] not null default '{}';

create or replace function public.bk_report_payment(p_booking_id uuid, p_expected_version integer, p_customer uuid, p_report jsonb)
returns public.bk_bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bk_bookings;
  v_kind text;
  v_due integer;
  v_report jsonb;
begin
  select * into b from public.bk_bookings where id = p_booking_id and customer_user_id = p_customer for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if b.status = 'pending' then
    if b.payment_status not in ('awaiting', 'reported') then raise exception 'INVALID_STATE'; end if;
  elsif b.status = 'confirmed' then
    if b.total_price <= b.paid_amount then raise exception 'INVALID_STATE'; end if;
  else
    raise exception 'INVALID_STATE';
  end if;

  -- 金額由系統算:訂金 = 訂金 - 已付;全額 = 總額 - 已付(訂金已付清時只剩全額可選)
  v_kind := case when p_report->>'kind' = 'full' and b.total_price > b.paid_amount then 'full' else 'deposit' end;
  if v_kind = 'deposit' and b.deposit_amount <= b.paid_amount then v_kind := 'full'; end if;
  v_due := case when v_kind = 'full' then b.total_price - b.paid_amount else b.deposit_amount - b.paid_amount end;
  if v_due <= 0 then raise exception 'INVALID_STATE'; end if;
  v_report := (coalesce(p_report, '{}'::jsonb) - 'amount' - 'kind' - 'at')
    || jsonb_build_object('kind', v_kind, 'amount', v_due, 'at', now());

  update public.bk_bookings
     set payment_status = case when payment_status in ('awaiting', 'reported') then 'reported' else payment_status end,
         payment_report = v_report, version = version + 1, updated_at = now()
   where id = b.id
   returning * into b;

  insert into public.bk_booking_events (booking_id, business_id, version, type, actor_type, actor_id, payload)
  values (b.id, b.business_id, b.version, 'payment_reported', 'customer', p_customer, v_report);
  insert into public.bk_notification_outbox (business_id, booking_id, booking_version, event, audience)
  values (b.business_id, b.id, b.version, 'payment_reported', 'owner') on conflict do nothing;
  return b;
end $$;
revoke all on function public.bk_report_payment(uuid, integer, uuid, jsonb) from public, anon, authenticated;

commit;
