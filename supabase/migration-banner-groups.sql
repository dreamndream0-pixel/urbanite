-- 輪播圖分組:輪播圖1(原本的首頁輪播)、輪播圖2…,模板首頁的「輪播圖」板塊可以選要顯示哪一組
alter table public.banners add column if not exists group_no integer not null default 1;
create index if not exists banners_group_idx on public.banners (shop_id, group_no, sort_order);
