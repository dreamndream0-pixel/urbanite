-- =============================================================
-- 預約 E4:服務人員專屬頁(不用登入,憑私密連結查看自己的行程、填班表與休假)
-- bk_staff.portal_token:由店家產生 / 重設;空 = 沒有開放專屬頁。可重複執行。
-- =============================================================
begin;
alter table public.bk_staff add column if not exists portal_token text;
create unique index if not exists bk_staff_portal_token_idx on public.bk_staff (portal_token) where portal_token is not null;
commit;
