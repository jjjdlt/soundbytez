import { createClient } from "@supabase/supabase-js";

// Browser-safe values: the publishable (or legacy anon) key only grants what
// row-level security allows. Set them in frontend/.env.local (see .env.example).
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key ? createClient(url, key) : null;

if (!supabase) console.warn("Supabase env vars missing — accounts are disabled (see frontend/.env.example)");
