-- =============================================================
-- 網站外觀:配色與版面配置(後台 系統設定 → 一般設定)。可重複執行。
-- =============================================================

alter table public.site_settings
  add column if not exists site_theme jsonb not null default '{}';  -- { template, colors, layout }
