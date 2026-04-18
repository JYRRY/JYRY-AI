/**
 * Shared Supabase client for Framer Code Components.
 *
 * IMPORTANT: paste this file as a Framer Code Component named exactly
 * `framer-client` (before any component that imports from it). Edit the
 * two constants below with the values from your Supabase dashboard
 * (Settings → API). Both are PUBLIC — safe to ship in the browser bundle.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ── Edit these two lines ──────────────────────────────────────────────
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";
// ──────────────────────────────────────────────────────────────────────

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function invokeAgent<T>(name: string, body: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return (data as { data: T }).data;
}

export async function signedUrl(path: string, bucket: "generated" | "user-docs" = "generated"): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
