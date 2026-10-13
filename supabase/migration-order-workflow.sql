-- Run after the existing multi-shop, order tracking, returns and integrations migrations.
-- No historical orders are replayed. Only shops that save notification settings enqueue jobs.
begin;

create table if not exists public.order_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null check(event in ('created','ready','shipped','paid','arrived','picked_up','completed','cancelled','refunded')),
  audience text not null check(audience in ('buyer','seller')),
  channel text not null check(channel in ('email','line')),
  status text not null default 'pending' check(status in ('pending','processing','sent','skipped','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  first_send_at timestamptz,
  payload jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists order_notification_due on public.order_notification_jobs(status,available_at);
create index if not exists order_notification_shop on public.order_notification_jobs(shop_id,created_at desc);
alter table public.order_notification_jobs enable row level security;
revoke all on public.order_notification_jobs from public, anon, authenticated;
grant select,insert,update,delete on public.order_notification_jobs to service_role;

create or replace function public.enqueue_order_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare events text[] := '{}'; e text;
begin
  if not exists(select 1 from public.integration_settings where key = 'SHOP_ORDER_NOTIFICATIONS:' || new.shop_id::text) then return new; end if;
  if tg_op = 'INSERT' then
    events := array_append(events,'created');
    if new.payment_status = 'PAID' then events := array_append(events,'paid'); end if;
  else
    if new.fulfillment_status is distinct from old.fulfillment_status then
      if new.fulfillment_status in ('PREPARING','READY_TO_SHIP') and old.fulfillment_status not in ('PREPARING','READY_TO_SHIP') then events := array_append(events,'ready'); end if;
      if new.fulfillment_status in ('SHIPPED','IN_TRANSIT') and old.fulfillment_status not in ('SHIPPED','IN_TRANSIT') then events := array_append(events,'shipped'); end if;
      if new.fulfillment_status in ('AT_STORE','DELIVERED') and old.fulfillment_status not in ('AT_STORE','DELIVERED','PICKED_UP') then events := array_append(events,'arrived'); end if;
      if new.fulfillment_status = 'PICKED_UP' then events := array_append(events,'picked_up'); end if;
    end if;
    if new.payment_status is distinct from old.payment_status then
      if new.payment_status = 'PAID' then events := array_append(events,'paid'); end if;
      if new.payment_status in ('REFUNDED','PARTIALLY_REFUNDED') then events := array_append(events,'refunded'); end if;
    end if;
    if new.order_status is distinct from old.order_status then
      if new.order_status = 'COMPLETED' then events := array_append(events,'completed'); end if;
      if new.order_status = 'CANCELLED' then events := array_append(events,'cancelled'); end if;
    end if;
  end if;
  foreach e in array events loop
    insert into public.order_notification_jobs(shop_id,order_id,event,audience,channel)
      select new.shop_id,new.id,e,a,c from unnest(array['buyer','seller']) a cross join unnest(array['email','line']) c;
  end loop;
  return new;
end $$;
revoke all on function public.enqueue_order_notifications() from public, anon, authenticated;
drop trigger if exists order_notification_outbox on public.orders;
create trigger order_notification_outbox after insert or update on public.orders
for each row execute function public.enqueue_order_notifications();

create or replace function public.claim_order_notifications(p_limit integer default 12)
returns setof public.order_notification_jobs language sql security definer set search_path = '' as $$
  with due as (
    select id from public.order_notification_jobs
    where (status = 'pending' and available_at <= now()) or (status = 'processing' and lease_until < now())
    order by created_at for update skip locked limit greatest(1,least(p_limit,20))
  ) update public.order_notification_jobs j
    set status='processing', attempts=attempts+1, lease_token=gen_random_uuid(), lease_until=now()+interval '2 minutes'
    from due where j.id=due.id returning j.*;
$$;
revoke all on function public.claim_order_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_order_notifications(integer) to service_role;

-- Called only by authenticated server routes; p_seller is derived from server authorization.
create or replace function public.manual_order_transition(p_shop uuid,p_order uuid,p_actor uuid,p_seller boolean,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; s public.shipments%rowtype; target text; pickup boolean; note text;
begin
  if p_actor is null or p_action is null or p_seller is null or p_action not in ('arrived','complete') or (p_action='arrived' and not p_seller) then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id=p_order and shop_id=p_shop for update;
  if not found or (not p_seller and o.user_id is distinct from p_actor) then raise exception 'NOT_FOUND'; end if;
  if p_action='complete' and o.user_id is distinct from p_actor then raise exception 'FORBIDDEN'; end if;
  select * into s from public.shipments where order_id=o.id and shop_id=p_shop order by created_at desc,id desc limit 1 for update;
  if not found then raise exception 'NOT_SHIPPED'; end if;
  if (select count(*) from public.shipments where order_id=o.id) <> 1 then raise exception 'MULTIPLE_SHIPMENTS'; end if;
  -- Refuse mixed/integrated shipments rather than silently overriding provider state.
  if exists(select 1 from public.shipments where order_id=o.id and
    (shop_id is distinct from p_shop or coalesce(lgs_type,'')<>'' or coalesce(ship_type,'')<>'' or lower(coalesce(provider,'')) in ('newebpay','ecpay'))) then raise exception 'INTEGRATED_SHIPMENT'; end if;
  if o.status in ('取消','已取消','退貨') or o.order_status in ('CANCELLED','CLOSED') or
     o.payment_status in ('REFUNDED','PARTIALLY_REFUNDED') or coalesce(o.cancel_status,'') in ('REQUESTED','APPROVED') or
     exists(select 1 from public.returns where order_id=o.id and shop_id=p_shop and status <> 'REJECTED') then raise exception 'ORDER_BLOCKED'; end if;
  if p_action='complete' and o.order_status='COMPLETED' then return to_jsonb(o); end if;
  if o.order_status='COMPLETED' or o.fulfillment_status not in ('SHIPPED','IN_TRANSIT','AT_STORE','DELIVERED','PICKED_UP') or
     s.status not in ('SHIPPED','IN_TRANSIT','AT_STORE','DELIVERED','PICKED_UP') then raise exception 'INVALID_STATE'; end if;
  pickup := coalesce(o.store_lgs_type,'')='MANUAL' or coalesce(o.store_id,'')<>'' or coalesce(o.shipping_method,'') ~* '(超商|店到店|取貨|pickup)';
  target := case when pickup then case when p_action='complete' then 'PICKED_UP' else 'AT_STORE' end else 'DELIVERED' end;
  if p_action='arrived' and o.fulfillment_status=target and s.status=target then return to_jsonb(o); end if;
  if p_action='arrived' and (s.status in ('DELIVERED','PICKED_UP') or o.fulfillment_status='PICKED_UP') then raise exception 'INVALID_STATE'; end if;
  note := case when p_action='complete' then '買家確認收貨並完成訂單' else '賣家確認已到貨' end;
  update public.shipments set status=target, delivered_at=case when target in ('DELIVERED','PICKED_UP') then coalesce(delivered_at,now()) else delivered_at end,updated_at=now() where id=s.id;
  insert into public.shipment_events(shop_id,shipment_id,status,description) values(p_shop,s.id,target,note);
  if o.fulfillment_status is distinct from target then
    insert into public.order_status_history(shop_id,order_id,type,from_status,to_status,note,created_by)
      values(p_shop,o.id,'fulfillment',o.fulfillment_status,target,note,p_actor::text);
  end if;
  if p_action='complete' then
    insert into public.order_status_history(shop_id,order_id,type,from_status,to_status,note,created_by)
      values(p_shop,o.id,'order',o.order_status,'COMPLETED',note,p_actor::text);
  end if;
  -- Receipt never settles a payment, including COD.
  update public.orders set fulfillment_status=target,
    status=case when p_action='complete' then '已完成' else status end,
    order_status=case when p_action='complete' then 'COMPLETED' else order_status end
    where id=o.id returning * into o;
  return to_jsonb(o);
end $$;
revoke all on function public.manual_order_transition(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.manual_order_transition(uuid,uuid,uuid,boolean,text) to service_role;

create or replace function public.order_workflow_version() returns integer
language sql security definer set search_path='' as $$ select 1 $$;
revoke all on function public.order_workflow_version() from public,anon,authenticated;
grant execute on function public.order_workflow_version() to service_role;
commit;
