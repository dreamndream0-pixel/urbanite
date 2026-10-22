-- Opt-in shared business identity. Existing accounts and URLs are not rewritten.
begin;
alter table public.profile_cards add column if not exists business_identity boolean not null default false;
alter table public.profile_cards add column if not exists shop_id uuid references public.shops(id) on delete set null;
create unique index if not exists profile_cards_business_shop_key on public.profile_cards(shop_id) where shop_id is not null;

create or replace function public.guard_business_card() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not new.business_identity then return new; end if;
  if new.slug !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' or length(trim(new.display_name)) not between 1 and 40 then
    raise exception 'Invalid shared business name or URL' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('business-slug:' || new.slug, 0));
  if new.shop_id is not null and not exists (
    select 1 from public.shops where id = new.shop_id and owner_user_id = new.owner_user_id
  ) then raise exception 'Business owner mismatch' using errcode = '23514'; end if;
  if exists (select 1 from public.shops where slug = new.slug and id is distinct from new.shop_id) then
    raise exception 'Business URL already used' using errcode = '23505';
  end if;
  return new;
end $$;

create or replace function public.sync_business_card() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not new.business_identity then return new; end if;
  update public.shops set name = new.display_name, slug = new.slug
    where id = new.shop_id and owner_user_id = new.owner_user_id
    and (name is distinct from new.display_name or slug is distinct from new.slug);
  update public.bk_businesses set card_id = new.id, name = new.display_name, updated_at = now()
    where owner_user_id = new.owner_user_id and (card_id is null or card_id = new.id)
    and (name is distinct from new.display_name or card_id is distinct from new.id);
  return new;
end $$;

create or replace function public.guard_business_shop() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('business-slug:' || new.slug, 0));
  if tg_op = 'INSERT' or new.slug is distinct from old.slug then
    if exists (select 1 from public.profile_cards where business_identity and slug = new.slug
      and owner_user_id is distinct from new.owner_user_id) then
      raise exception 'Business URL already used' using errcode = '23505';
    end if;
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.profile_cards where business_identity
    and owner_user_id = new.owner_user_id and (shop_id is null)
    and (slug is distinct from new.slug or display_name is distinct from new.name)) then
    raise exception 'Use the confirmed business name and URL' using errcode = '23514';
  end if;
  if exists (select 1 from public.profile_cards where shop_id = new.id
    and owner_user_id is distinct from new.owner_user_id) then
    raise exception 'Business owner mismatch' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function public.sync_business_shop() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    update public.profile_cards set shop_id = new.id, updated_at = now()
      where business_identity and owner_user_id = new.owner_user_id and shop_id is null
      and slug = new.slug and display_name = new.name;
  else
    update public.profile_cards set display_name = new.name, slug = new.slug, updated_at = now()
      where business_identity and shop_id = new.id and owner_user_id = new.owner_user_id
      and (display_name is distinct from new.name or slug is distinct from new.slug);
  end if;
  return new;
end $$;

create or replace function public.sync_business_booking() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare c public.profile_cards;
begin
  select * into c from public.profile_cards where id = new.card_id
    and owner_user_id = new.owner_user_id and business_identity;
  if not found then return new; end if;
  if tg_op = 'INSERT' then
    new.name := c.display_name;
  end if;
  return new;
end $$;

drop trigger if exists guard_business_card on public.profile_cards;
create trigger guard_business_card before insert or update on public.profile_cards for each row execute function public.guard_business_card();
drop trigger if exists sync_business_card on public.profile_cards;
create trigger sync_business_card after insert or update on public.profile_cards for each row execute function public.sync_business_card();
drop trigger if exists guard_business_shop on public.shops;
create trigger guard_business_shop before insert or update on public.shops for each row execute function public.guard_business_shop();
drop trigger if exists sync_business_shop on public.shops;
create trigger sync_business_shop after insert or update on public.shops for each row execute function public.sync_business_shop();
drop trigger if exists sync_business_booking on public.bk_businesses;
create trigger sync_business_booking before insert on public.bk_businesses for each row execute function public.sync_business_booking();
-- AFTER avoids changing the booking row twice during its own BEFORE update.
create or replace function public.sync_business_booking_name() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.profile_cards set display_name = new.name, updated_at = now()
    where business_identity and id = new.card_id and owner_user_id = new.owner_user_id
    and display_name is distinct from new.name;
  return new;
end $$;
drop trigger if exists sync_business_booking_name on public.bk_businesses;
create trigger sync_business_booking_name after update of name on public.bk_businesses for each row execute function public.sync_business_booking_name();
revoke all on function public.guard_business_card(), public.sync_business_card(), public.guard_business_shop(), public.sync_business_shop(), public.sync_business_booking(), public.sync_business_booking_name() from public, anon, authenticated;
commit;
