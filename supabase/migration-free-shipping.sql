begin;

alter table public.site_settings
  add column if not exists free_shipping_threshold integer default 2000
  check (free_shipping_threshold between 0 and 1000000000);

comment on column public.site_settings.free_shipping_threshold is
  'Store-wide shipping threshold in TWD before coupon/credit deductions; NULL disables, 0 is unconditional, default 2000.';

notify pgrst, 'reload schema';
commit;
