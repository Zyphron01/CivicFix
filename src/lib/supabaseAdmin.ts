import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("SECURITY ERROR: supabaseAdmin can only be used on the server!");
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);