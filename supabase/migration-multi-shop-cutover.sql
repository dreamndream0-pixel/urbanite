-- 多店家上線(第二步):移除舊的「全站唯一」限制
-- 必須和多店家版本的程式「同時」上線:舊程式用 onConflict 'user_id' 寫入會員資料,先跑這段會讓舊程式出錯。
-- 前提:已執行 migration-multi-shop.sql(已建立同一家店內唯一的新索引)。可重複執行。

-- 原本「全站唯一」的欄位改成「同一家店內唯一」
do $$
declare r record;
begin
  -- 找出單一欄位的唯一限制並移除(主鍵不動)
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'u' and array_length(c.conkey, 1) = 1
      and ((c.conrelid = 'public.discounts'::regclass and a.attname = 'code')
        or (c.conrelid = 'public.categories'::regclass and a.attname = 'slug')
        or (c.conrelid = 'public.campaigns'::regclass and a.attname = 'slug')
        or (c.conrelid = 'public.customers'::regclass and a.attname = 'user_id'))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

drop index if exists public.customers_line_user_id_key;
