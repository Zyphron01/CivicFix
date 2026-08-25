import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectSchema() {
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  console.log("=== INSPECTING DATABASE SCHEMA FOR DEPARTMENT ROUTING ===");
  const { data: issues } = await supabaseAdmin.from("issues").select("id, status, department_id, team_id, moderation_status").limit(5);
  const { data: teams } = await supabaseAdmin.from("teams").select("*");
  const { data: profiles } = await supabaseAdmin.from("profiles").select("*");
  const { data: assignments } = await supabaseAdmin.from("assignments").select("*").limit(5);

  console.log("Issues sample:", issues);
  console.log("Teams sample:", teams);
  console.log("Profiles sample:", profiles);
  console.log("Assignments sample:", assignments);
}

inspectSchema().catch(console.error);
