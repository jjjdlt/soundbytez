/**
 * MOCK auth — localStorage only, no server. Swap for Supabase later.
 *
 * The surface intentionally mirrors supabase-js so the swap is mechanical:
 *   signUp({ email, password })             -> supabase.auth.signUp(...)
 *   signIn({ email, password })             -> supabase.auth.signInWithPassword(...)
 *   signOut()                               -> supabase.auth.signOut()
 *   session restore on load                 -> supabase.auth.getSession() + onAuthStateChange
 *
 * Passwords are SHA-256 hashed before being stored, but this is still NOT secure —
 * anything in localStorage is readable by any script on the page. Dev only.
 */
import { createContext, useContext, useState } from "react";

const USERS_KEY = "sbz.mock.users";     // { [email]: { id, email, passwordHash, createdAt } }
const SESSION_KEY = "sbz.mock.session"; // { user: { id, email } }

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

async function hash(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => read(SESSION_KEY, null)?.user ?? null);

  const startSession = (u) => {
    const publicUser = { id: u.id, email: u.email };
    write(SESSION_KEY, { user: publicUser });
    setUser(publicUser);
  };

  const signUp = async ({ email, password }) => {
    email = email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter a valid email");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    const users = read(USERS_KEY, {});
    if (users[email]) throw new Error("An account with that email already exists");
    const u = { id: crypto.randomUUID(), email, passwordHash: await hash(password), createdAt: Date.now() };
    write(USERS_KEY, { ...users, [email]: u });
    startSession(u);
  };

  const signIn = async ({ email, password }) => {
    email = email.trim().toLowerCase();
    const u = read(USERS_KEY, {})[email];
    if (!u || u.passwordHash !== (await hash(password))) throw new Error("Invalid email or password");
    startSession(u);
  };

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
