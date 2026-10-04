-- =============================================================
-- LINE 機器人:歡迎訊息、關鍵字回覆、圖文選單、推播、訂單通知、數據。可重複執行。
-- =============================================================

-- 機器人設定(單一列):歡迎訊息、預設回覆、內建查詢、訂單通知、排程金鑰
create table if not exists public.line_bot_config (
  id         int primary key default 1,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- 關鍵字自動回覆
create table if not exists public.line_bot_rules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  keywords    text[] not null default '{}',
  match       text not null default 'contains',      -- exact / contains
  content     jsonb not null default '{"messages":[],"quickReplies":[]}',
  enabled     boolean not null default true,
  schedule    jsonb,                                  -- { days:[0-6], start:'HH:MM', end:'HH:MM' }
  sort_order  int not null default 0,
  hits        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 圖文選單(聊天室下方)
create table if not exists public.line_rich_menus (
  id                uuid primary key default gen_random_uuid(),
  name              text not null default '',
  audience          text not null default 'guest',    -- guest 未綁定 / member 已綁定會員
  size              text not null default 'large',    -- large 2500x1686 / compact 2500x843
  layout            text not null default 'l6',
  areas             jsonb not null default '[]',      -- 每格動作
  design            jsonb not null default '{}',      -- 樣板產生的設定(底色、文字、圖示)
  image_url         text not null default '',
  chat_bar_text     text not null default '選單',
  line_rich_menu_id text,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 推播(群發)
create table if not exists public.line_broadcasts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default '',
  content      jsonb not null default '{"messages":[],"quickReplies":[]}',
  audience     text not null default 'members',
  status       text not null default 'draft',         -- draft / scheduled / sending / sent / failed
  scheduled_at timestamptz,
  sent_at      timestamptz,
  recipients   int not null default 0,
  error        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 事件紀錄(數據分析用,不含訊息內容)
create table if not exists public.line_events (
  id           bigserial primary key,
  type         text not null,                         -- follow / unfollow / message / rule / builtin / default / click / notify
  line_user_id text,
  key          text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists line_events_created_idx on public.line_events (created_at);
create index if not exists line_events_type_idx on public.line_events (type, created_at);

alter table public.line_bot_config enable row level security;
alter table public.line_bot_rules enable row level security;
alter table public.line_rich_menus enable row level security;
alter table public.line_broadcasts enable row level security;
alter table public.line_events enable row level security;
-- 一律透過後端 service_role 存取

-- 排程金鑰(排程呼叫 /api/cron/line 時驗證)
insert into public.line_bot_config (id, data)
values (1, jsonb_build_object('cronKey', encode(gen_random_bytes(18), 'hex')))
on conflict (id) do update
  set data = public.line_bot_config.data || jsonb_build_object('cronKey', coalesce(public.line_bot_config.data->>'cronKey', encode(gen_random_bytes(18), 'hex')));

-- 每 5 分鐘:處理排程推播與訂單通知
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'line-bot-every-5-min';
select cron.schedule(
  'line-bot-every-5-min',
  '*/5 * * * *',
  $job$
    select net.http_get(
      url := 'https://www.urbanite.com.tw/api/cron/line?key=' || (select data->>'cronKey' from public.line_bot_config where id = 1),
      timeout_milliseconds := 25000
    );
  $job$
);
