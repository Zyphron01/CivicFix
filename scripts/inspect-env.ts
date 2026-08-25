import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";

async function inspectDbConnectionEnv() {
  console.log("=== INSPECTING DATABASE DEPLOYMENT ENVIRONMENT ===");
  const envContent = fs.readFileSync(".env.local", "utf8");
  const keys = envContent.split("\n").map(l => l.split("=")[0].trim()).filter(Boolean);
  console.log("Keys present in .env.local:", keys);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

  console.log("NEXT_PUBLIC_SUPABASE_URL present:", !!url);
  console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY present:", !!anonKey);
  console.log("SUPABASE_SERVICE_ROLE_KEY present:", !!serviceRoleKey);
  console.log("DATABASE_URL / POSTGRES_URL present:", !!dbUrl);
}

inspectDbConnectionEnv().catch(console.error);
