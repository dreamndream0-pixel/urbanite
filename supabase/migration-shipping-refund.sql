-- 退款中屬於運費的金額(退貨 / 標記退款時勾選「退運費」)
alter table public.orders add column if not exists shipping_refund integer not null default 0;
