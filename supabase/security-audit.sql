-- Read-only. Run in the SQL Editor; results contain policy definitions, not customer rows.
select schemaname, tablename, rowsecurity from pg_catalog.pg_tables where schemaname in ('public', 'storage') order by schemaname, tablename;
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies where schemaname in ('public', 'storage') order by schemaname, tablename, policyname;
select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants
where grantee in ('anon', 'authenticated', 'PUBLIC') and table_schema in ('public', 'storage') order by table_schema, table_name, grantee;
select n.nspname, p.proname, p.prosecdef, p.proconfig, p.proacl
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef order by p.proname;
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
