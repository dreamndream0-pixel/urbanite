-- 藍新物流串接欄位，可重複執行。
alter table public.orders
  add column if not exists store_id text default '',
  add column if not exists store_name text default '',
  add column if not exists store_phone text default '',
  add column if not exists store_address text default '',
  add column if not exists store_ship_type text default '',
  add column if not exists store_lgs_type text default '',
  add column if not exists store_extra jsonb;

alter table public.shipments
  add column if not exists lgs_type text default '',
  add column if not exists ship_type text default '',
  add column if not exists trade_type text default '',
  add column if not exists store_id text default '',
  add column if not exists store_name text default '',
  add column if not exists store_phone text default '',
  add column if not exists store_address text default '',
  add column if not exists store_print_no text default '',
  add column if not exists trade_no text default '',
  add column if not exists raw_response jsonb;

alter table public.shipment_events
  add column if not exists ret_id text default '',
  add column if not exists raw_response jsonb;

alter table public.site_settings
  add column if not exists newebpay_logistics_enabled boolean not null default true;
