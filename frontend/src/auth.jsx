/**
 * Supabase email/password auth. The session is persisted by supabase-js (in
 * localStorage) and refreshed automatically, so returning users stay signed in.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

const requireSupabase = () => {
  if (!supabase) throw new Error("Accounts aren't configured yet (missing Supabase env vars)");
  return supabase;
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  /** Resolves to { needsConfirmation: true } when the project requires email confirmation. */
  const signUp = async ({ email, password }) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  };

  const signIn = async ({ email, password }) => {
    const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  };

  const signOut = () => supabase?.auth.signOut();

  const value = {
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
    ready,
    enabled: !!supabase,
    signUp,
    signIn,
    signOut,
  };

  // Hold rendering until the stored session is read, so returning users
  // don't see a flash of the logged-out landing page.
  return <AuthContext.Provider value={value}>{ready ? children : null}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
