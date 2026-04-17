import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

/**
 * Service-role client — bypasses RLS. Use for any writes the user
 * shouldn't be trusted to make directly (agent_runs, generated_documents, etc.).
 * ALWAYS scope queries with getUserId(req) first.
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Extract the authenticated user id from a Supabase JWT in the
 * Authorization header. Throws if the header is missing/invalid.
 */
export async function getUserId(req: Request): Promise<string> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("missing bearer token");
  const jwt = auth.slice(7);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("invalid jwt");
  return data.user.id;
}
