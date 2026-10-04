-- =============================================================
-- 個人名片頁:圖文連結(多張圖片、版型、自動輪播)。可重複執行。
-- =============================================================

alter table public.profile_card_blocks
  add column if not exists items   jsonb not null default '[]',  -- [{ image, title, url }]
  add column if not exists options jsonb not null default '{}';  -- { layout, captionMode, autoplay }
