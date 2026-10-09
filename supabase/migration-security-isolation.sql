-- Server-only sensitive tables. Existing API service-role access remains available.
-- Review security-audit.sql results first. Apply as the project database owner.
begin;
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_status_history', 'customers', 'payments', 'refunds', 'returns',
    'shipments', 'shipment_events', 'favorites', 'user_coupons', 'coupon_usages', 'stock_movements',
    'card_payments', 'card_subscriptions', 'integration_settings', 'shop_members'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists sensitive_server_only on public.%I', t);
    execute format('create policy sensitive_server_only on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;

-- Restrictive policy prevents unrelated permissive Storage policies exposing this bucket.
drop policy if exists payment_proofs_server_only on storage.objects;
create policy payment_proofs_server_only on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'payment-proofs') with check (bucket_id <> 'payment-proofs');

create or replace function public.prevent_shop_reassignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.shop_id is distinct from old.shop_id then raise exception 'SHOP_REASSIGNMENT_FORBIDDEN'; end if;
  return new;
end;
$$;
revoke all on function public.prevent_shop_reassignment() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['banners', 'campaigns', 'campaign_products', 'categories', 'customers', 'discounts',
    'user_coupons', 'coupon_usages', 'favorites', 'orders', 'order_status_history', 'payments', 'refunds',
    'returns', 'shipments', 'shipment_events', 'products', 'site_settings', 'stock_movements'] loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='shop_id') then continue; end if;
    execute format('drop trigger if exists prevent_shop_reassignment on public.%I', t);
    execute format('create trigger prevent_shop_reassignment before update of shop_id on public.%I for each row execute function public.prevent_shop_reassignment()', t);
  end loop;
end $$;
commit;
