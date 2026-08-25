import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { execSync } from "child_process";

async function testDeploymentTools() {
  console.log("=== CHECKING DEPLOYMENT TOOLS & SUPABASE CLI ===");
  try {
    const supabaseVersion = execSync("npx supabase --version", { encoding: "utf8" });
    console.log("✓ npx supabase is available. Version:", supabaseVersion.trim());
  } catch (e: any) {
    console.log("❌ npx supabase CLI error:", e.message);
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  console.log("SUPABASE_ACCESS_TOKEN present in env:", !!token);

  const dbUrl = process.env.DATABASE_URL;
  console.log("DATABASE_URL present in env:", !!dbUrl);
}

testDeploymentTools().catch(console.error);
