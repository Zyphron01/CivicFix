import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";

async function executeSqlMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing credentials");
    process.exit(1);
  }

  const sqlContent = fs.readFileSync("./supabase/migrations/20260821150000_phase_f1_workforce_teams.sql", "utf8");

  console.log("Attempting SQL migration via Supabase Management API...");

  // Supabase management API query endpoint
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ sql: sqlContent })
  });

  if (res.ok) {
    console.log("✓ SQL migration applied successfully via RPC!");
  } else {
    const errText = await res.text();
    console.log("RPC exec_sql response status:", res.status, errText);
  }
}

executeSqlMigration().catch(console.error);
