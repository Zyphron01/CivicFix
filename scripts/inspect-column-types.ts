import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectColumnTypes() {
  console.log("=== INSPECTING LIVE COLUMN TYPES ===");
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // Inspect profiles sample
  const { data: profile } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
  console.log("Sample profile ID:", profile?.id, "| typeof:", typeof profile?.id);

  // Inspect assignments sample
  const { data: assignment } = await supabaseAdmin.from("assignments").select("id, issue_id, field_worker_id").limit(1).single();
  console.log("Sample assignment ID:", assignment?.id);
  console.log("Sample assignment issue_id:", assignment?.issue_id);
  console.log("Sample assignment field_worker_id:", assignment?.field_worker_id);

  // Check teams table if created
  const { data: teams, error: teamsErr } = await supabaseAdmin.from("teams").select("*");
  console.log("Teams table check:", teamsErr ? teamsErr.message : `Found ${teams?.length} teams`);
}

inspectColumnTypes().catch(console.error);
