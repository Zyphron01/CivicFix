import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log("Supabase URL:", supabaseUrl);
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  
  // List auth users
  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) {
    console.error("Error listing users:", usersErr);
  } else {
    console.log(`Found ${usersData.users.length} auth users:`);
    for (const u of usersData.users) {
      console.log(`- ID: ${u.id}, Email: ${u.email}`);
    }
  }

  // List profiles
  const { data: profiles, error: profErr } = await admin.from("profiles").select("*");
  if (profErr) {
    console.error("Error fetching profiles:", profErr);
  } else {
    console.log(`Found ${profiles.length} profiles:`);
    for (const p of profiles) {
      console.log(`- ID: ${p.id}, FullName: ${p.full_name}, Role: ${p.role}`);
    }
  }
}

main().catch(console.error);
