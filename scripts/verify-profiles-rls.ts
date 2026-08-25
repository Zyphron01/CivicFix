import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyProfilesTable() {
  console.log("Checking if profiles table exists on Supabase...");
  try {
    const { data, error } = await supabase.from("profiles").select("*").limit(1);
    if (error) {
      console.log(`❌ profiles table: ${error.message}`);
    } else {
      console.log(`✅ profiles table: EXISTS (${data?.length || 0} rows found)`);
    }
  } catch (e) {
    console.log(`❌ profiles table check failed: ${e}`);
  }
}

verifyProfilesTable().catch(console.error);
