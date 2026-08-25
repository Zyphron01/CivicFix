import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectRLSPolicies() {
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  console.log("=== INSPECTING ISSUES TABLE SCHEMA ===");

  const { data: issues, error: issuesErr } = await supabaseAdmin.from("issues").select("*").limit(1);
  if (issues && issues.length > 0) {
    console.log("Issues keys:", Object.keys(issues[0]));
    console.log("Sample issue row:", issues[0]);
  } else {
    console.log("Error selecting issues:", issuesErr);
  }
}

inspectRLSPolicies().catch(console.error);
