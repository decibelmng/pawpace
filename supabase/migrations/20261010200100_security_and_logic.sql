-- PawPace: helpers, row level security, app functions, storage, realtime

-- ---------- helpers ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where profile_id = (select auth.uid()));
$$;

create or replace function public.is_match_member(p_match uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match and (select auth.uid()) in (m.owner_id, m.runner_id)
  );
$$;

create or replace function public.is_run_member(p_run uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.runs r
    where r.id = p_run and (select auth.uid()) in (r.owner_id, r.runner_id)
  );
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.miles_between(lat1 double precision, lng1 double precision,
                                                lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- a matched runner may read a dog's care details
create or replace function public.can_read_dog_care(p_dog uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dogs d where d.id = p_dog and d.owner_id = (select auth.uid()))
      or exists (
        select 1 from public.listing_dogs ld
        join public.matches m on m.listing_id = ld.listing_id
        where ld.dog_id = p_dog and m.runner_id = (select auth.uid()) and m.status = 'matched'
      );
$$;

-- storage paths: chat/<match_id>/..., reports/<run_id>/..., docs/<profile_id>/...
create or replace function public.can_access_private_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_id uuid;
begin
  if array_length(v_parts, 1) < 3 then return false; end if;
  begin
    v_id := v_parts[2]::uuid;
  exception when others then
    return false;
  end;
  if v_parts[1] = 'chat' then return public.is_match_member(v_id); end if;
  if v_parts[1] = 'reports' then return public.is_run_member(v_id); end if;
  if v_parts[1] = 'docs' then return v_id = (select auth.uid()) or public.is_admin(); end if;
  return false;
end;
$$;

-- ---------- new users ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  insert into public.profile_private (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- people can't hand themselves admin-only fields
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    new.suspended_until := old.suspended_until;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.guard_runner_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    new.rating_avg := old.rating_avg;
    new.runs_completed := old.runs_completed;
  end if;
  return new;
end;
$$;

create trigger runner_profiles_guard before update on public.runner_profiles
  for each row execute function public.guard_runner_update();

create or replace function public.guard_dog_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    new.rating_avg := old.rating_avg;
  end if;
  return new;
end;
$$;

create trigger dogs_guard before update on public.dogs
  for each row execute function public.guard_dog_update();

-- ---------- row level security ----------
alter table public.cities enable row level security;
alter table public.pricing_tiers enable row level security;
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.runner_profiles enable row level security;
alter table public.admins enable row level security;
alter table public.dogs enable row level security;
alter table public.dog_care enable row level security;
alter table public.listings enable row level security;
alter table public.listing_dogs enable row level security;
alter table public.photos enable row level security;
alter table public.availability_windows enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.runs enable row level security;
alter table public.run_points enable row level security;
alter table public.run_reports enable row level security;
alter table public.ratings enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.tips enable row level security;
alter table public.badges enable row level security;
alter table public.strikes enable row level security;
alter table public.user_reports enable row level security;
alter table public.blocks enable row level security;
alter table public.admin_actions enable row level security;
alter table public.push_tokens enable row level security;

-- reference data: anyone signed in can read, admins edit
create policy "read cities" on public.cities for select to authenticated using (true);
create policy "admin cities" on public.cities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read tiers" on public.pricing_tiers for select to authenticated using (true);
create policy "admin tiers" on public.pricing_tiers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read settings" on public.platform_settings for select to authenticated using (true);
create policy "admin settings" on public.platform_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: public card fields visible to signed-in users you haven't blocked
create policy "read profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin()
         or not public.is_blocked_between(id, (select auth.uid())));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

create policy "own private" on public.profile_private for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy "update own private" on public.profile_private for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read runner profiles" on public.runner_profiles for select to authenticated using (true);
create policy "insert own runner profile" on public.runner_profiles for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy "update own runner profile" on public.runner_profiles for update to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin())
  with check (profile_id = (select auth.uid()) or public.is_admin());

create policy "see own admin row" on public.admins for select to authenticated
  using (profile_id = (select auth.uid()));

-- dogs and listings
create policy "read dogs" on public.dogs for select to authenticated using (true);
create policy "insert own dogs" on public.dogs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "update own dogs" on public.dogs for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "delete own dogs" on public.dogs for delete to authenticated using (owner_id = (select auth.uid()));

create policy "read dog care" on public.dog_care for select to authenticated
  using (public.can_read_dog_care(dog_id) or public.is_admin());
create policy "write own dog care" on public.dog_care for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())));

create policy "read listings" on public.listings for select to authenticated using (true);
create policy "insert own listings" on public.listings for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "update own listings" on public.listings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "delete own listings" on public.listings for delete to authenticated using (owner_id = (select auth.uid()));

create policy "read listing dogs" on public.listing_dogs for select to authenticated using (true);
create policy "write own listing dogs" on public.listing_dogs for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
    and exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid()))
  );

create policy "read photos" on public.photos for select to authenticated
  using (status = 'approved' or owner_id = (select auth.uid()) or public.is_admin());
create policy "insert own photos" on public.photos for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'approved'
    and (subject_type <> 'profile' or subject_id = (select auth.uid()))
    and (subject_type <> 'dog' or exists (select 1 from public.dogs d where d.id = subject_id and d.owner_id = (select auth.uid())))
  );
create policy "update own photos" on public.photos for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "delete own photos" on public.photos for delete to authenticated using (owner_id = (select auth.uid()));

create policy "read availability" on public.availability_windows for select to authenticated using (true);
create policy "write own availability" on public.availability_windows for all to authenticated
  using (profile_id = (select auth.uid())
         or exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())))
  with check (profile_id = (select auth.uid())
         or exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())));

-- matching: written only through record_swipe()
create policy "read own swipes" on public.swipes for select to authenticated
  using ((actor = 'runner' and runner_id = (select auth.uid()))
      or (actor = 'owner' and exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))));

create policy "read own matches" on public.matches for select to authenticated
  using ((select auth.uid()) in (owner_id, runner_id) or public.is_admin());

create policy "read match messages" on public.messages for select to authenticated
  using (public.is_match_member(match_id) or public.is_admin());
create policy "send messages" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and run_id is null and ai_flag is null and read_at is null
    and exists (select 1 from public.matches m where m.id = match_id and m.status = 'matched'
                and (select auth.uid()) in (m.owner_id, m.runner_id))
  );

-- runs: written only through functions below
create policy "read own runs" on public.runs for select to authenticated
  using ((select auth.uid()) in (owner_id, runner_id) or public.is_admin());

create policy "read run points" on public.run_points for select to authenticated
  using (public.is_run_member(run_id) or public.is_admin());
create policy "runner adds points" on public.run_points for insert to authenticated
  with check (exists (select 1 from public.runs r where r.id = run_id
                      and r.runner_id = (select auth.uid()) and r.status = 'in_progress'));

create policy "read run reports" on public.run_reports for select to authenticated
  using (public.is_run_member(run_id) or public.is_admin());
create policy "read ratings" on public.ratings for select to authenticated
  using (public.is_run_member(run_id) or public.is_admin());

-- money: read your own, never write from the app
create policy "read own payment account" on public.payment_accounts for select to authenticated
  using (profile_id = (select auth.uid()));
create policy "read run payments" on public.payments for select to authenticated
  using (public.is_run_member(run_id) or public.is_admin());
create policy "read own tips" on public.tips for select to authenticated
  using ((select auth.uid()) in (owner_id, runner_id) or public.is_admin());

-- trust and safety
create policy "read badges" on public.badges for select to authenticated using (true);
create policy "admin badges" on public.badges for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read own strikes" on public.strikes for select to authenticated
  using (runner_id = (select auth.uid()) or public.is_admin());
create policy "file reports" on public.user_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy "read own reports" on public.user_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());
create policy "admin reports" on public.user_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "own blocks" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "remove own blocks" on public.blocks for delete to authenticated using (blocker_id = (select auth.uid()));
create policy "admin actions" on public.admin_actions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "own push tokens" on public.push_tokens for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- ---------- matching ----------
create or replace function public.record_swipe(p_listing uuid, p_runner uuid, p_direction text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_actor text;
  v_other text;
  v_other_dir text;
  v_match_id uuid;
begin
  if p_direction not in ('left', 'right') then raise exception 'Direction must be left or right'; end if;
  select owner_id into v_owner from public.listings where id = p_listing and active;
  if v_owner is null then raise exception 'That listing is no longer available'; end if;
  if v_owner = p_runner then raise exception 'You cannot match with your own dog'; end if;

  if v_uid = v_owner then v_actor := 'owner';
  elsif v_uid = p_runner then v_actor := 'runner';
  else raise exception 'Not allowed';
  end if;

  if v_actor = 'runner' and not exists (
    select 1 from public.runner_profiles where profile_id = p_runner and active) then
    raise exception 'Finish your runner profile first';
  end if;
  if public.is_blocked_between(v_owner, p_runner) then return 'passed'; end if;

  insert into public.swipes (listing_id, runner_id, actor, direction)
  values (p_listing, p_runner, v_actor, p_direction)
  on conflict (listing_id, runner_id, actor)
  do update set direction = excluded.direction, created_at = now();

  if p_direction = 'left' then
    update public.matches set status = 'declined'
    where listing_id = p_listing and runner_id = p_runner and status = 'requested';
    return 'passed';
  end if;

  v_other := case v_actor when 'owner' then 'runner' else 'owner' end;
  select direction into v_other_dir from public.swipes
  where listing_id = p_listing and runner_id = p_runner and actor = v_other;

  if v_other_dir = 'right' then
    insert into public.matches (listing_id, owner_id, runner_id, status, requested_by, matched_at)
    values (p_listing, v_owner, p_runner, 'matched', v_other, now())
    on conflict (listing_id, runner_id) do update
      set status = 'matched', matched_at = coalesce(public.matches.matched_at, now())
      where public.matches.status in ('requested', 'declined');
    select id into v_match_id from public.matches where listing_id = p_listing and runner_id = p_runner;
    if not exists (select 1 from public.messages where match_id = v_match_id) then
      insert into public.messages (match_id, body)
      values (v_match_id, 'You matched! Work out a time here, then tap Lock in run.');
    end if;
    return 'matched';
  end if;

  insert into public.matches (listing_id, owner_id, runner_id, status, requested_by)
  values (p_listing, v_owner, p_runner, 'requested', v_actor)
  on conflict (listing_id, runner_id) do update
    set status = 'requested', requested_by = excluded.requested_by
    where public.matches.status = 'declined';
  return 'requested';
end;
$$;

-- runners an owner sees for one listing
create or replace function public.get_runner_deck(
  p_listing uuid, p_max_mi numeric default 5, p_min_rating numeric default 0,
  p_gender text default null, p_limit int default 20)
returns table (
  profile_id uuid, display_name text, neighborhood text, bio text, gender text,
  pace_min_sec int, pace_max_sec int, miles_min numeric, miles_max numeric,
  styles text[], sizes_accepted text[], rating_avg numeric, runs_completed int,
  distance_mi numeric, photo_path text, background_checked boolean, requested_you boolean)
language sql stable security definer set search_path = '' as $$
  with me as (
    select l.id as listing_id, l.owner_id, pp.home_lat, pp.home_lng
    from public.listings l
    join public.profile_private pp on pp.id = l.owner_id
    where l.id = p_listing and l.owner_id = (select auth.uid())
  ),
  dogs as (
    select d.* from public.listing_dogs ld join public.dogs d on d.id = ld.dog_id
    where ld.listing_id = p_listing
  )
  select p.id, p.display_name, p.neighborhood, p.bio, rp.gender,
         rp.pace_min_sec, rp.pace_max_sec, rp.miles_min, rp.miles_max,
         rp.styles, rp.sizes_accepted, rp.rating_avg, rp.runs_completed,
         round(public.miles_between(me.home_lat, me.home_lng, rpp.home_lat, rpp.home_lng)::numeric, 1),
         (select ph.path from public.photos ph where ph.subject_type = 'profile' and ph.subject_id = p.id
            and ph.status = 'approved' order by ph.sort limit 1),
         exists (select 1 from public.badges b where b.profile_id = p.id and b.type = 'background_check' and b.status = 'verified'),
         exists (select 1 from public.matches m where m.listing_id = me.listing_id and m.runner_id = p.id
                   and m.status = 'requested' and m.requested_by = 'runner')
  from me
  join public.runner_profiles rp on rp.active
  join public.profiles p on p.id = rp.profile_id
  join public.profile_private rpp on rpp.id = p.id
  where p.id <> me.owner_id
    and (p.suspended_until is null or p.suspended_until < now())
    and not public.is_blocked_between(p.id, me.owner_id)
    and not exists (select 1 from public.swipes s where s.listing_id = me.listing_id
                    and s.runner_id = p.id and s.actor = 'owner')
    and not exists (select 1 from public.matches m where m.listing_id = me.listing_id
                    and m.runner_id = p.id and m.status in ('matched', 'blocked'))
    and me.home_lat is not null and rpp.home_lat is not null
    and public.miles_between(me.home_lat, me.home_lng, rpp.home_lat, rpp.home_lng)
        <= least(p_max_mi, rp.service_radius_mi)
    and coalesce(rp.rating_avg, 5) >= p_min_rating
    and (p_gender is null or rp.gender = p_gender)
    and (select count(*) from dogs) <= rp.max_dogs
    and not exists (select 1 from dogs d where not (d.size = any (rp.sizes_accepted)))
    and (
      not exists (select 1 from public.availability_windows w join dogs d on d.id = w.dog_id)
      or exists (
        select 1 from public.availability_windows rw
        join public.availability_windows dw on dw.weekday = rw.weekday
          and dw.start_time < rw.end_time and rw.start_time < dw.end_time
        join dogs d on d.id = dw.dog_id
        where rw.profile_id = p.id)
    )
  order by 17 desc, 14 asc, rp.rating_avg desc nulls last
  limit p_limit;
$$;

-- listings a runner sees
create or replace function public.get_dog_deck(
  p_max_mi numeric default 5, p_sizes text[] default null, p_limit int default 20)
returns table (
  listing_id uuid, title text, owner_id uuid, owner_name text, neighborhood text,
  distance_mi numeric, from_price_cents int, dogs jsonb, requested_you boolean)
language sql stable security definer set search_path = '' as $$
  with me as (
    select rp.*, pp.home_lat, pp.home_lng, p.city_id
    from public.runner_profiles rp
    join public.profile_private pp on pp.id = rp.profile_id
    join public.profiles p on p.id = rp.profile_id
    where rp.profile_id = (select auth.uid()) and rp.active
  ),
  settings as (select * from public.platform_settings where id = 1)
  select l.id, l.title, o.id, o.display_name, o.neighborhood,
         round(public.miles_between(me.home_lat, me.home_lng, opp.home_lat, opp.home_lng)::numeric, 1),
         (select t.price_cents from public.pricing_tiers t
            where t.city_id = coalesce(o.city_id, 'DC') and t.code = coalesce(l.preferred_tier, 'standard'))
           + greatest(0, (select count(*)::int from public.listing_dogs x where x.listing_id = l.id) - 1)
             * (select extra_dog_cents from settings),
         (select jsonb_agg(jsonb_build_object(
            'id', d.id, 'name', d.name, 'breed', d.breed, 'size', d.size, 'energy', d.energy,
            'birth_year', d.birth_year, 'run_minutes_min', d.run_minutes_min, 'run_minutes_max', d.run_minutes_max,
            'leash_manners', d.leash_manners, 'reactive_dogs', d.reactive_dogs,
            'reactive_people', d.reactive_people, 'reactive_bikes', d.reactive_bikes,
            'heat_sensitive', d.heat_sensitive, 'rating_avg', d.rating_avg,
            'photo_path', (select ph.path from public.photos ph where ph.subject_type = 'dog'
                             and ph.subject_id = d.id and ph.status = 'approved' order by ph.sort limit 1)))
          from public.listing_dogs ld join public.dogs d on d.id = ld.dog_id where ld.listing_id = l.id),
         exists (select 1 from public.matches m where m.listing_id = l.id and m.runner_id = me.profile_id
                   and m.status = 'requested' and m.requested_by = 'owner')
  from me
  join public.listings l on l.active and l.owner_id <> me.profile_id
  join public.profiles o on o.id = l.owner_id
  join public.profile_private opp on opp.id = o.id
  where (o.suspended_until is null or o.suspended_until < now())
    and not public.is_blocked_between(o.id, me.profile_id)
    and not exists (select 1 from public.swipes s where s.listing_id = l.id
                    and s.runner_id = me.profile_id and s.actor = 'runner')
    and not exists (select 1 from public.matches m where m.listing_id = l.id
                    and m.runner_id = me.profile_id and m.status in ('matched', 'blocked'))
    and me.home_lat is not null and opp.home_lat is not null
    and public.miles_between(me.home_lat, me.home_lng, opp.home_lat, opp.home_lng)
        <= least(p_max_mi, me.service_radius_mi)
    and (select count(*) from public.listing_dogs x where x.listing_id = l.id) between 1 and me.max_dogs
    and not exists (
      select 1 from public.listing_dogs x join public.dogs d on d.id = x.dog_id
      where x.listing_id = l.id
        and (not (d.size = any (me.sizes_accepted)) or (p_sizes is not null and not (d.size = any (p_sizes)))))
  order by 9 desc, 6 asc
  limit p_limit;
$$;

create or replace function public.block_user(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_other = auth.uid() then raise exception 'You cannot block yourself'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_other) on conflict do nothing;
  update public.matches set status = 'blocked'
  where (owner_id = auth.uid() and runner_id = p_other) or (owner_id = p_other and runner_id = auth.uid());
end;
$$;

-- ---------- runs ----------
create or replace function public.propose_run(
  p_match uuid, p_scheduled_at timestamptz, p_tier_code text,
  p_extra_dogs int default 0, p_gps boolean default false, p_repeat boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  m public.matches;
  v_city text;
  t public.pricing_tiers;
  s public.platform_settings;
  v_base int; v_commission int; v_gps int; v_extra int;
  v_run uuid;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or v_uid not in (m.owner_id, m.runner_id) then raise exception 'Not allowed'; end if;
  if m.status <> 'matched' then raise exception 'You can only book runs with a match'; end if;
  if p_scheduled_at < now() + interval '1 hour' then raise exception 'Pick a time at least an hour from now'; end if;
  if p_scheduled_at > now() + interval '60 days' then raise exception 'Pick a time within the next 60 days'; end if;
  if p_extra_dogs < 0 or p_extra_dogs > 2 then raise exception 'Up to 2 extra dogs per run'; end if;

  select coalesce(city_id, 'DC') into v_city from public.profiles where id = m.owner_id;
  select * into t from public.pricing_tiers where city_id = v_city and code = p_tier_code and active;
  if t.id is null then raise exception 'That tier is not offered in this city'; end if;
  select * into s from public.platform_settings where id = 1;

  v_extra := p_extra_dogs * s.extra_dog_cents;
  v_base := t.price_cents + v_extra;
  v_commission := round(v_base * s.commission_bps / 10000.0);
  v_gps := case when p_gps then s.gps_addon_cents else 0 end;

  insert into public.runs (match_id, owner_id, runner_id, listing_id, proposed_by, city_id, scheduled_at,
    tier_code, minutes, miles, extra_dogs, gps_addon, repeat_weekly,
    price_cents, extra_dog_cents, gps_cents, booking_fee_cents, commission_cents,
    owner_total_cents, runner_payout_cents)
  values (m.id, m.owner_id, m.runner_id, m.listing_id, v_uid, v_city, p_scheduled_at,
    t.code, t.minutes, t.miles, p_extra_dogs, p_gps, p_repeat,
    t.price_cents, v_extra, v_gps, s.booking_fee_cents, v_commission,
    v_base + s.booking_fee_cents + v_gps, v_base - v_commission)
  returning id into v_run;

  insert into public.messages (match_id, sender_id, run_id) values (m.id, v_uid, v_run);
  return v_run;
end;
$$;

create or replace function public.respond_run(p_run uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null or auth.uid() not in (r.owner_id, r.runner_id) then raise exception 'Not allowed'; end if;
  if r.proposed_by = auth.uid() then raise exception 'The other person accepts the run'; end if;
  if r.status <> 'proposed' then raise exception 'This run was already answered'; end if;
  update public.runs set status = case when p_accept then 'confirmed' else 'declined' end where id = p_run;
  insert into public.messages (match_id, body) values (r.match_id,
    case when p_accept then 'Run confirmed. Reminders are set for 24 hours and 1 hour before.'
         else 'Run declined. Keep chatting to find another time.' end);
  return case when p_accept then 'confirmed' else 'declined' end;
end;
$$;

create or replace function public.start_run(p_run uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null or r.runner_id <> auth.uid() then raise exception 'Only the runner starts the run'; end if;
  if r.status <> 'confirmed' then raise exception 'This run is not ready to start'; end if;
  if now() < r.scheduled_at - interval '2 hours' then raise exception 'You can start up to 2 hours early'; end if;
  update public.runs set status = 'in_progress', started_at = now() where id = p_run;
end;
$$;

create or replace function public.finish_run(p_run uuid, p_distance_mi numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null or r.runner_id <> auth.uid() then raise exception 'Only the runner finishes the run'; end if;
  if r.status <> 'in_progress' then raise exception 'This run has not started'; end if;
  update public.runs set ended_at = now(), distance_mi = greatest(0, p_distance_mi) where id = p_run;
end;
$$;

create or replace function public.submit_run_report(
  p_run uuid, p_leash smallint, p_energy smallint, p_behavior smallint,
  p_pace smallint, p_overall smallint, p_notes text default null, p_photo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null or r.runner_id <> auth.uid() then raise exception 'Only the runner files the report'; end if;
  if r.status <> 'in_progress' or r.ended_at is null then raise exception 'Finish the run first'; end if;

  insert into public.run_reports (run_id, runner_id, leash_manners, energy, behavior, pace_fit, overall, notes, photo_path)
  values (p_run, r.runner_id, p_leash, p_energy, p_behavior, p_pace, p_overall, p_notes, p_photo);

  update public.runs set status = 'completed', dispute_open_until = now() + interval '24 hours' where id = p_run;
  update public.runner_profiles set runs_completed = runs_completed + 1 where profile_id = r.runner_id;
  update public.dogs d set rating_avg = sub.avg
  from (
    select ld.dog_id, round(avg(rr.overall)::numeric, 2) as avg
    from public.listing_dogs ld
    join public.runs x on x.listing_id = ld.listing_id
    join public.run_reports rr on rr.run_id = x.id
    where ld.listing_id = r.listing_id
    group by ld.dog_id
  ) sub where d.id = sub.dog_id;
  insert into public.messages (match_id, body) values (r.match_id, 'Run complete. The report is ready to read.');
end;
$$;

create or replace function public.submit_rating(
  p_run uuid, p_punctuality smallint, p_communication smallint, p_care smallint,
  p_report smallint, p_overall smallint, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = p_run;
  if r.id is null or r.owner_id <> auth.uid() then raise exception 'Only the owner rates the runner'; end if;
  if r.status <> 'completed' then raise exception 'Rate after the run is complete'; end if;
  insert into public.ratings (run_id, owner_id, runner_id, punctuality, communication, care, report_quality, overall, notes)
  values (p_run, r.owner_id, r.runner_id, p_punctuality, p_communication, p_care, p_report, p_overall, p_notes);
  update public.runner_profiles set rating_avg =
    (select round(avg(overall)::numeric, 2) from public.ratings where runner_id = r.runner_id)
  where profile_id = r.runner_id;
end;
$$;

create or replace function public.add_strike(p_runner uuid, p_run uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.strikes (runner_id, run_id, reason) values (p_runner, p_run, p_reason);
  if (select count(*) from public.strikes where runner_id = p_runner and created_at > now() - interval '30 days') >= 3 then
    update public.profiles set suspended_until = now() + interval '30 days' where id = p_runner;
  end if;
end;
$$;
revoke execute on function public.add_strike(uuid, uuid, text) from public, anon, authenticated;

-- cancellation policy. Amounts in cents.
--   weather: free for both sides, no strike
--   owner 12h+: full refund | 2-12h: owner pays half the run + booking fee | under 2h: owner pays run + booking fee
--   runner: owner refunded in full; under 12h is a strike
create or replace function public.cancel_run(p_run uuid, p_weather boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.runs;
  v_actor text;
  v_hours numeric;
  v_base int;
  v_charge int := 0;
  v_comp int := 0;
  v_reason text;
  v_strike boolean := false;
  s public.platform_settings;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null or auth.uid() not in (r.owner_id, r.runner_id) then raise exception 'Not allowed'; end if;
  if r.status not in ('proposed', 'confirmed') then raise exception 'This run can no longer be cancelled'; end if;
  select * into s from public.platform_settings where id = 1;
  v_actor := case when auth.uid() = r.owner_id then 'owner' else 'runner' end;
  v_hours := extract(epoch from (r.scheduled_at - now())) / 3600;
  v_base := r.price_cents + r.extra_dog_cents;

  if r.status = 'proposed' then
    v_reason := 'standard';
  elsif p_weather then
    v_reason := 'weather';
  elsif v_actor = 'owner' then
    if v_hours >= 12 then v_reason := 'standard';
    elsif v_hours >= 2 then
      v_reason := 'late';
      v_charge := round(v_base * 0.5) + r.booking_fee_cents;
      v_comp := round(v_base * 0.5) - round(round(v_base * 0.5) * s.commission_bps / 10000.0);
    else
      v_reason := 'late';
      v_charge := v_base + r.booking_fee_cents;
      v_comp := r.runner_payout_cents;
    end if;
  else
    v_reason := case when v_hours < 12 then 'late' else 'standard' end;
    v_strike := v_hours < 12;
  end if;

  update public.runs set status = 'cancelled', cancelled_by = v_actor, cancel_reason = v_reason,
    refund_cents = r.owner_total_cents - v_charge, runner_comp_cents = v_comp
  where id = p_run;
  if v_strike then perform public.add_strike(r.runner_id, r.id, 'Late cancellation'); end if;

  insert into public.messages (match_id, body) values (r.match_id,
    case v_reason when 'weather' then 'Run cancelled for weather. No charge, no strike.'
                  else 'Run cancelled by the ' || v_actor || '.' end);

  return jsonb_build_object('reason', v_reason, 'cancelled_by', v_actor,
    'owner_charged_cents', v_charge, 'runner_comp_cents', v_comp, 'strike', v_strike);
end;
$$;

-- owner reports a no-show 30+ minutes after the start time
create or replace function public.report_no_show(p_run uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null or r.owner_id <> auth.uid() then raise exception 'Only the owner reports a no-show'; end if;
  if r.status <> 'confirmed' then raise exception 'This run already started or ended'; end if;
  if now() < r.scheduled_at + interval '30 minutes' then raise exception 'Wait 30 minutes past the start time'; end if;
  update public.runs set status = 'cancelled', cancelled_by = 'runner', cancel_reason = 'no_show',
    refund_cents = r.owner_total_cents, runner_comp_cents = 0 where id = p_run;
  perform public.add_strike(r.runner_id, r.id, 'No-show');
  insert into public.messages (match_id, body) values (r.match_id, 'Marked as a runner no-show. Full refund issued.');
end;
$$;

create or replace function public.open_dispute(p_run uuid, p_details text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null or r.owner_id <> auth.uid() then raise exception 'Only the owner opens a dispute'; end if;
  if r.status <> 'completed' or now() > r.dispute_open_until then raise exception 'The 24-hour dispute window has closed'; end if;
  update public.runs set status = 'disputed' where id = p_run;
  insert into public.user_reports (reporter_id, target_profile_id, match_id, reason, details)
  values (r.owner_id, r.runner_id, r.match_id, 'run_dispute', p_details);
end;
$$;

create or replace function public.mark_messages_read(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_match_member(p_match) then raise exception 'Not allowed'; end if;
  update public.messages set read_at = now()
  where match_id = p_match and read_at is null and coalesce(sender_id, '00000000-0000-0000-0000-000000000000') <> auth.uid();
end;
$$;

-- only signed-in users may call app functions
do $$
declare f text;
begin
  foreach f in array array[
    'record_swipe(uuid,uuid,text)', 'get_runner_deck(uuid,numeric,numeric,text,integer)',
    'get_dog_deck(numeric,text[],integer)', 'block_user(uuid)',
    'propose_run(uuid,timestamp with time zone,text,integer,boolean,boolean)', 'respond_run(uuid,boolean)',
    'start_run(uuid)', 'finish_run(uuid,numeric)',
    'submit_run_report(uuid,smallint,smallint,smallint,smallint,smallint,text,text)',
    'submit_rating(uuid,smallint,smallint,smallint,smallint,smallint,text)',
    'cancel_run(uuid,boolean)', 'report_no_show(uuid)', 'open_dispute(uuid,text)', 'mark_messages_read(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg','image/png','image/heic','image/webp']),
       ('private', 'private', false, 15728640, array['image/jpeg','image/png','image/heic','image/webp','application/pdf'])
on conflict (id) do nothing;

-- profile and dog photos live at photos/<user id>/...
create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "update own photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- chat photos, report photos, documents
create policy "read private objects" on storage.objects for select to authenticated
  using (bucket_id = 'private' and public.can_access_private_object(name));
create policy "upload private objects" on storage.objects for insert to authenticated
  with check (bucket_id = 'private' and public.can_access_private_object(name));

-- ---------- realtime ----------
alter publication supabase_realtime add table public.messages, public.matches, public.runs, public.run_points;
