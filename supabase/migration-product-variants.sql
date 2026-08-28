-- =============================================================
-- 商品規格制 + 各規格分別庫存
-- specs   : 規格維度定義,例如 [{"name":"顏色","options":["紅","綠","藍"]},{"name":"尺寸","options":["S","M","L"]}]
-- variants: 每個規格組合的庫存,例如 [{"options":["紅","S"],"inventory":10}, ...]
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

alter table public.products
  add column if not exists specs    jsonb not null default '[]',
  add column if not exists variants jsonb not null default '[]';
