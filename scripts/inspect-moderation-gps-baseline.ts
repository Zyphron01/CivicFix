import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectBaseline() {
  console.log("====================================================");
  console.log("  MODERATION & GPS FEATURE — BASELINE INVESTIGATION ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Table Record Counts
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id");
  const { data: issues } = await supabaseAdmin.from("issues").select("*");
  const { data: reports } = await supabaseAdmin.from("reports").select("*");
  const { data: assignments } = await supabaseAdmin.from("assignments").select("id, is_active");
  const { data: teams } = await supabaseAdmin.from("teams").select("id");
  const { data: members } = await supabaseAdmin.from("team_members").select("id");
  const { data: statusHistory } = await supabaseAdmin.from("status_history").select("id");

  console.log("1. Live Database Counts:");
  console.log(`   - profiles: ${profiles?.length ?? 0}`);
  console.log(`   - issues: ${issues?.length ?? 0}`);
  console.log(`   - reports: ${reports?.length ?? 0}`);
  console.log(`   - assignments: ${assignments?.length ?? 0} (${assignments?.filter(a => a.is_active).length ?? 0} active)`);
  console.log(`   - teams: ${teams?.length ?? 0}`);
  console.log(`   - team_members: ${members?.length ?? 0}`);
  console.log(`   - status_history: ${statusHistory?.length ?? 0}`);

  // 2. Issues & Reports Columns Inspection
  const sampleIssue = issues?.[0] || {};
  const sampleReport = reports?.[0] || {};
  const { data: sampleHistory } = await supabaseAdmin.from("status_history").select("*").limit(1).single();
  console.log("4. Status History Sample Columns:", Object.keys(sampleHistory || {}));
  console.log("   Sample status_history row:", sampleHistory);
  console.log("\n2. Issues Columns:", Object.keys(sampleIssue));
  console.log("3. Reports Columns:", Object.keys(sampleReport));
  console.log("4. Status History Columns:", Object.keys(sampleHistory || {}));

  // 5. Protected Phase C Record Inspection
  const { data: phaseC } = await supabaseAdmin.from("issues").select("*").eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba").maybeSingle();
  console.log(`\n5. Protected Phase C Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): ${phaseC ? 'PRESENT & INTACT (' + phaseC.status + ')' : 'MISSING!'}`);

  console.log("====================================================");
  console.log(" BASELINE INVESTIGATION COMPLETE                    ");
  console.log("====================================================");
}

inspectBaseline().catch(console.error);
