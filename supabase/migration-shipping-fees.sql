-- =============================================================
-- 運費設定:各物流方式運費(site_settings) + 商品各物流方式自訂運費(products)
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

-- 後台各物流方式的預設運費:[{ "name": "宅配到府", "fee": 120 }, ...]
alter table public.site_settings
  add column if not exists shipping_fees jsonb not null default '[]';

-- 商品各物流方式的自訂運費(覆寫後台預設):{ "宅配到府": 80, "7-11取貨付款": 60 }
alter table public.products
  add column if not exists shipping_fee_overrides jsonb;
