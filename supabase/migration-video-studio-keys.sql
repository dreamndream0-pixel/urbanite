-- 影片網站呼叫點數服務用的密鑰:只保存 SHA-256,不保存明文。可同時存在多把以便更換。
create table if not exists public.video_studio_keys (
  key_hash    text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now()
);
alter table public.video_studio_keys enable row level security;
