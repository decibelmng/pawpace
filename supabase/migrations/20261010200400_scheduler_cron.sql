-- Every 15 minutes: place card holds for runs in the next 48 hours, and pay runners
-- once the 24-hour dispute window has passed. The shared secret lives only in the vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'PawPace scheduler secret');

create or replace function public.cron_secret()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
$$;
revoke execute on function public.cron_secret() from public, anon, authenticated;
grant execute on function public.cron_secret() to service_role;

select cron.schedule(
  'pawpace-scheduler',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://taywuqiufuyutttukfyj.supabase.co/functions/v1/scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
    body := '{}'::jsonb
  );
  $$
);
