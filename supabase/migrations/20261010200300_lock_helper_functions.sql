-- Helpers used inside security rules: signed-in users only (policies need them), never anonymous
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_match_member(uuid) from public, anon;
revoke execute on function public.is_run_member(uuid) from public, anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke execute on function public.can_read_dog_care(uuid) from public, anon;
revoke execute on function public.can_access_private_object(text) from public, anon;
grant execute on function public.is_admin(), public.is_match_member(uuid), public.is_run_member(uuid),
  public.is_blocked_between(uuid, uuid), public.can_read_dog_care(uuid),
  public.can_access_private_object(text) to authenticated;

-- Trigger functions are never called directly
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.guard_runner_update() from public, anon, authenticated;
revoke execute on function public.guard_dog_update() from public, anon, authenticated;
