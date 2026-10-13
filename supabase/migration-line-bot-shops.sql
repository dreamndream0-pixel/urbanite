-- =============================================================
-- LINE 機器人分店家:5 張 LINE 機器人資料表加上 shop_id,舊資料歸 URBANITE。可重複執行,不刪資料。
-- 先跑這份,再部署程式。
-- =============================================================

-- 設定:原本只有一列(id=1),改成一家店一列(shop_id 唯一)
alter table public.line_bot_config add column if not exists shop_id uuid references public.shops(id) on delete cascade;
update public.line_bot_config set shop_id = '00000000-0000-0000-0000-000000000001' where shop_id is null;
alter table public.line_bot_config alter column shop_id set not null;
alter table public.line_bot_config alter column shop_id set default '00000000-0000-0000-0000-000000000001';
create unique index if not exists line_bot_config_shop_key on public.line_bot_config (shop_id);
create sequence if not exists public.line_bot_config_id_seq;
select setval('public.line_bot_config_id_seq', greatest((select coalesce(max(id), 1) from public.line_bot_config), 1));
alter table public.line_bot_config alter column id set default nextval('public.line_bot_config_id_seq');

-- 其他表:加 shop_id(預設 URBANITE,舊程式寫入時也正確)
do $$
declare t text;
begin
  foreach t in array array['line_bot_rules', 'line_rich_menus', 'line_broadcasts', 'line_events'] loop
    execute format('alter table public.%I add column if not exists shop_id uuid references public.shops(id) on delete cascade', t);
    execute format('update public.%I set shop_id = %L where shop_id is null', t, '00000000-0000-0000-0000-000000000001');
    execute format('alter table public.%I alter column shop_id set default %L', t, '00000000-0000-0000-0000-000000000001');
    execute format('alter table public.%I alter column shop_id set not null', t);
    execute format('create index if not exists %I on public.%I (shop_id)', t || '_shop_idx', t);
  end loop;
end $$;
create index if not exists line_events_shop_type_idx on public.line_events (shop_id, type, created_at);
create index if not exists line_broadcasts_due_idx on public.line_broadcasts (status, scheduled_at);
