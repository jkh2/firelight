// ---------------------------------------------------------------------------
// Sign in with Google, through Supabase. Switched on only when the build has
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (both safe to publish; never
// the service-role key). Until then, people join with just a name.
// The Supabase library loads only when sign-in is switched on.
// ---------------------------------------------------------------------------

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const signInAvailable = !!(URL_ && KEY);

let client = null;
async function sb() {
  if (!signInAvailable) return null;
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(URL_, KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  }
  return client;
}

/** The signed-in person, or null: { token, name, email }. */
export async function currentUser() {
  const c = await sb();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  const s = data?.session;
  if (!s) return null;
  const m = s.user.user_metadata || {};
  return { token: s.access_token, name: m.full_name || m.name || (s.user.email || '').split('@')[0], email: s.user.email };
}

/** Leaves for Google's sign-in page and comes back to this same link (with its ?fire=). */
export async function signInWithGoogle() {
  const c = await sb();
  if (!c) return;
  await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
}

export async function signOut() {
  const c = await sb();
  await c?.auth.signOut();
}
