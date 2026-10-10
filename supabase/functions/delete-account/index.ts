// In-app account deletion (required by Apple). Removes personal data and photos, keeps
// anonymized run and payment records the business must retain, and closes the login.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const userClient = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Sign in first" }), { status: 401 });
  const id = user.id;

  // photos in storage
  const { data: files } = await db.storage.from("photos").list(id, { limit: 1000 });
  for (const folder of files ?? []) {
    const { data: inner } = await db.storage.from("photos").list(`${id}/${folder.name}`, { limit: 1000 });
    const paths = (inner ?? []).map((f) => `${id}/${folder.name}/${f.name}`);
    if (paths.length) await db.storage.from("photos").remove(paths);
  }

  await db.from("photos").delete().eq("owner_id", id);
  await db.from("availability_windows").delete().eq("profile_id", id);
  await db.from("push_tokens").delete().eq("profile_id", id);
  await db.from("listings").update({ active: false }).eq("owner_id", id);
  await db.from("runner_profiles").update({ active: false }).eq("profile_id", id);
  await db.from("profile_private").update({
    birthdate: null, phone: null, home_lat: null, home_lng: null, handoff_note: null,
  }).eq("id", id);
  await db.from("profiles").update({
    display_name: "Deleted member", bio: null, neighborhood: null, is_owner: false, is_runner: false,
  }).eq("id", id);

  // If the person has no runs we can remove them completely; otherwise close the login.
  const { count } = await db.from("runs").select("id", { count: "exact", head: true })
    .or(`owner_id.eq.${id},runner_id.eq.${id}`);
  if (!count) {
    await db.auth.admin.deleteUser(id);
  } else {
    await db.auth.admin.updateUserById(id, {
      email: `deleted+${id}@pawpace.invalid`, phone: "", ban_duration: "876000h", user_metadata: {},
    });
  }
  return new Response(JSON.stringify({ deleted: true }), { headers: { "Content-Type": "application/json" } });
});
