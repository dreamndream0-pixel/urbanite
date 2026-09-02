-- =============================================================
-- 會員個人資料擴充欄位
-- =============================================================

alter table public.customers
  add column if not exists nickname   text default '',
  add column if not exists gender     text default '',            -- male / female / other / ''
  add column if not exists birthday   date,
  add column if not exists recipients jsonb not null default '[]', -- [{name, phone, city, district, address}]
  add column if not exists marketing  jsonb not null default '{}', -- {email:bool, sms:bool}
  add column if not exists privacy    jsonb not null default '{}'; -- {personalization:bool, show_activity:bool}
