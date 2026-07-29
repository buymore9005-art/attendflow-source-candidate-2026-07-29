-- AttendFlow scheduled maintenance.
-- Run after 000_full_schema.sql and after deploying the scheduled-maintenance Edge Function.
-- Configure once with public.configure_attendflow_scheduler(project_url, cron_secret).

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.upsert_vault_secret(
  p_name text,
  p_secret text,
  p_description text
) returns uuid
language plpgsql security definer
set search_path=public,vault
as $$
declare v_id uuid;
begin
  if nullif(trim(p_name),'') is null or nullif(p_secret,'') is null then
    raise exception 'Secret name and value are required' using errcode='22023';
  end if;
  select id into v_id from vault.secrets where name=p_name limit 1;
  if v_id is null then
    select vault.create_secret(p_secret,p_name,p_description) into v_id;
  else
    perform vault.update_secret(v_id,p_secret,p_name,p_description);
  end if;
  return v_id;
end $$;

create or replace function public.invoke_attendflow_maintenance() returns bigint
language plpgsql security definer
set search_path=public,vault,net
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name='attendflow_project_url'
  order by updated_at desc
  limit 1;

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name='attendflow_cron_secret'
  order by updated_at desc
  limit 1;

  if nullif(v_project_url,'') is null or nullif(v_cron_secret,'') is null then
    raise exception 'Scheduler Vault secrets are not configured' using errcode='P0001';
  end if;

  select net.http_post(
    url := rtrim(v_project_url,'/') || '/functions/v1/scheduled-maintenance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',v_cron_secret,
      'x-correlation-id',gen_random_uuid()::text
    ),
    body := jsonb_build_object(
      'source','supabase_cron',
      'invoked_at',now()
    ),
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end $$;

create or replace function public.disable_attendflow_scheduler() returns integer
language plpgsql security definer
set search_path=public,cron
as $$
declare v_job record; v_count integer := 0;
begin
  for v_job in select jobid from cron.job where jobname='attendflow-scheduled-maintenance' loop
    perform cron.unschedule(v_job.jobid);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.configure_attendflow_scheduler(
  p_project_url text,
  p_cron_secret text,
  p_schedule text default '*/5 * * * *'
) returns bigint
language plpgsql security definer
set search_path=public,cron,vault
as $$
declare v_job_id bigint;
begin
  if p_project_url !~ '^https://[a-z0-9-]+\\.supabase\\.co/?$' then
    raise exception 'Project URL must use the hosted Supabase HTTPS URL' using errcode='22023';
  end if;
  if char_length(p_cron_secret) < 32 then
    raise exception 'Cron secret must contain at least 32 characters' using errcode='22023';
  end if;
  if nullif(trim(p_schedule),'') is null or char_length(p_schedule) > 100 then
    raise exception 'A valid cron schedule is required' using errcode='22023';
  end if;

  perform public.upsert_vault_secret('attendflow_project_url',rtrim(p_project_url,'/'),'AttendFlow scheduled-maintenance project URL');
  perform public.upsert_vault_secret('attendflow_cron_secret',p_cron_secret,'AttendFlow scheduled-maintenance shared secret');
  perform public.disable_attendflow_scheduler();

  select cron.schedule(
    'attendflow-scheduled-maintenance',
    p_schedule,
    'select public.invoke_attendflow_maintenance();'
  ) into v_job_id;
  return v_job_id;
end $$;

revoke all on function public.upsert_vault_secret(text,text,text) from public,anon,authenticated;
revoke all on function public.invoke_attendflow_maintenance() from public,anon,authenticated;
revoke all on function public.disable_attendflow_scheduler() from public,anon,authenticated;
revoke all on function public.configure_attendflow_scheduler(text,text,text) from public,anon,authenticated;
grant execute on function public.upsert_vault_secret(text,text,text) to service_role;
grant execute on function public.invoke_attendflow_maintenance() to service_role;
grant execute on function public.disable_attendflow_scheduler() to service_role;
grant execute on function public.configure_attendflow_scheduler(text,text,text) to service_role;

commit;
