import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { execSync } from "child_process";
import fs from "fs";

async function investigateF43Access() {
  console.log("=== PHASE F4.3 — DEPLOYMENT ACCESS INVESTIGATION ===");

  // 1. Check environment keys presence
  const envKeys = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8").split("\n").map(l => l.split("=")[0].trim()).filter(Boolean)
    : [];

  console.log("- .env.local file present:", fs.existsSync(".env.local"));
  console.log("- Keys present in .env.local:", envKeys);

  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasAccessToken = !!process.env.SUPABASE_ACCESS_TOKEN;
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasProjectUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  console.log("- DATABASE_URL present:", hasDbUrl);
  console.log("- SUPABASE_ACCESS_TOKEN present:", hasAccessToken);
  console.log("- SUPABASE_SERVICE_ROLE_KEY present:", hasServiceRoleKey);
  console.log("- NEXT_PUBLIC_SUPABASE_URL present:", hasProjectUrl);

  // 2. Check Supabase CLI status and project linking
  try {
    const linkStatus = execSync("npx supabase status", { encoding: "utf8" });
    console.log("- Supabase CLI status output:", linkStatus.slice(0, 300));
  } catch (e: any) {
    console.log("- Supabase CLI status note:", e.message ? e.message.split("\n")[0] : "Not linked");
  }

  // 3. Test npx supabase db push dry run or project check
  try {
    const dryRun = execSync("npx supabase db push --dry-run", { encoding: "utf8" });
    console.log("- Supabase DB push dry-run output:", dryRun.slice(0, 300));
  } catch (e: any) {
    console.log("- Supabase DB push dry-run error:", e.message ? e.message.split("\n")[0] : "Error");
  }
}

investigateF43Access().catch(console.error);
