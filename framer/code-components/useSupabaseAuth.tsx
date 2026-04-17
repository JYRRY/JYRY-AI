/**
 * Shared auth hook for Framer Code Components.
 * Paste as a Framer Code Component named `useSupabaseAuth`.
 */
import * as React from "react";
import { supabase } from "../framer-client.ts";

export function useSupabaseAuth() {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = () => supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
      redirectTo: window.location.origin,
    },
  });

  const signOut = () => supabase.auth.signOut();

  return { userId, loading, signIn, signOut };
}
