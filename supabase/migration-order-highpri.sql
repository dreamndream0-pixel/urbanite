-- =============================================================
-- 訂單高優先強化:金額明細(§4)、後台備註(§22)、庫存旗標(§25)、
--   以及「客人取消申請 → 賣家審核」流程欄位
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run(重複執行安全)
-- =============================================================

-- ---------- §4 訂單金額明細 ----------
alter table public.orders
  add column if not exists member_discount   integer not null default 0, -- 會員折扣
  add column if not exists point_discount     integer not null default 0, -- 點數折抵
  add column if not exists shipping_discount  integer not null default 0, -- 運費優惠
  add column if not exists tax_amount         integer not null default 0, -- 稅額
  add column if not exists paid_amount        integer not null default 0, -- 實收
  add column if not exists refund_amount      integer not null default 0, -- 已退款
  add column if not exists net_amount         integer not null default 0; -- 淨額(實收 - 退款)

update public.orders set
  net_amount  = total - coalesce(refund_amount, 0),
  paid_amount = case when paid then total else coalesce(paid_amount, 0) end;

-- ---------- §22 後台專用備註(客人看不到) ----------
alter table public.orders
  add column if not exists admin_note text default '';

-- ---------- §25 庫存旗標(是否已扣庫存,供取消時回補判斷,避免重覆回補) ----------
-- 既有訂單一律視為「已扣庫存」(現行流程是下單當下即扣)。
alter table public.orders
  add column if not exists stock_committed boolean not null default true;

-- ---------- 客人取消申請 → 賣家審核 ----------
-- cancel_status: '' / REQUESTED(待審核) / APPROVED(已核准取消) / REJECTED(已婉拒)
alter table public.orders
  add column if not exists cancel_status       text default '',
  add column if not exists cancel_reason        text default '', -- 客人填的取消原因
  add column if not exists cancel_response       text default '', -- 賣家審核回覆
  add column if not exists cancel_requested_at   timestamptz,
  add column if not exists cancel_reviewed_at     timestamptz;
