-- Run after the application is deployed. Reuses the existing authenticated LINE cron command
-- without exposing its key. Does not change or disable the original broadcast job.
do $$
declare source_command text;
begin
  select command into source_command from cron.job
    where active and command like '%/api/cron/line%' order by jobid limit 1;
  if source_command is null then raise exception 'Configure an authenticated cron for /api/cron/order-notifications first'; end if;
  perform cron.schedule('order-notifications-every-5-min', '*/5 * * * *',
    replace(source_command, '/api/cron/line', '/api/cron/order-notifications'));
end $$;
