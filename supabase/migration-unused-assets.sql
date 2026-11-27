-- 找出 assets 裡已經沒有任何資料引用的店家圖片（換圖後留下的舊檔），供每週清理。
-- 只看店家自己上傳的資料夾；會員上傳、付款證明、LINE 圖、favicon、logo、member 一律不碰。
-- 上傳不滿 min_age 的檔案不算（編輯到一半還沒存檔的圖不會被刪）。
create or replace function public.unreferenced_store_assets(min_age interval default interval '7 days')
returns table (name text, bytes bigint)
language sql
security definer
set search_path = ''
as $$
  with refs as (
    select string_agg(x::text, ' ') as blob
    from (
      select query_to_xml(format('select * from %I.%I', table_schema, table_name), true, false, '') as x
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    ) s
  )
  select o.name, (o.metadata->>'size')::bigint
  from storage.objects o, refs
  where o.bucket_id = 'assets'
    and o.created_at < now() - min_age
    and (o.name ~ '^(products|banners|coupons|categories|storefront|campaigns|campaign-products)/[^/]+$'
         or o.name ~ '^profile-card/card-[^/]+$')
    and position(o.name in coalesce(refs.blob, '')) = 0
  order by o.created_at
$$;

revoke all on function public.unreferenced_store_assets(interval) from public, anon, authenticated;
grant execute on function public.unreferenced_store_assets(interval) to service_role;
