import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const URL = (import.meta as unknown as { env: Record<string, string> }).env
  ?.NEXT_PUBLIC_SUPABASE_URL ?? (globalThis as { NEXT_PUBLIC_SUPABASE_URL?: string }).NEXT_PUBLIC_SUPABASE_URL!;
const ANON = (import.meta as unknown as { env: Record<string, string> }).env
  ?.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (globalThis as { NEXT_PUBLIC_SUPABASE_ANON_KEY?: string }).NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase: SupabaseClient = createClient(URL, ANON, {
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
