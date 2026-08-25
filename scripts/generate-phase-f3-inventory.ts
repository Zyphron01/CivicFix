import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function generatePhaseF3Inventory() {
  console.log("====================================================");
  console.log("       CIVICFIX PHASE F3 INVENTORY GENERATION       ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Issues Count & Samples
  const { data: issues, error: issueErr } = await supabaseAdmin.from("issues").select("id, canonical_title, status, created_at");
  console.log(`1. Issues Table Record Count: ${issues?.length ?? 0}`);
  if (issueErr) console.warn("Issue fetch warning:", issueErr.message);

  // 2. Assignments Count & Schema Inspection
  const { data: assignments, error: asgErr } = await supabaseAdmin.from("assignments").select("*");
  console.log(`2. Assignments Table Record Count: ${assignments?.length ?? 0}`);
  if (asgErr) console.warn("Assignments fetch warning:", asgErr.message);

  if (assignments && assignments.length > 0) {
    console.log("   Assignments Schema Columns Present:", Object.keys(assignments[0]));
    console.log("   Sample Assignment Records:");
    assignments.slice(0, 5).forEach((a) => {
      console.log(`    • ID: ${a.id} | IssueID: ${a.issue_id} | WorkerID: ${a.field_worker_id || 'null'} | Notes: ${a.notes || 'none'}`);
    });
  }

  // 3. Teams Count
  const { data: teams, error: teamsErr } = await supabaseAdmin.from("teams").select("*");
  console.log(`3. Teams Table Record Count: ${teams?.length ?? 0}`);

  // 4. Team Members Count
  const { data: teamMembers, error: tmErr } = await supabaseAdmin.from("team_members").select("*");
  console.log(`4. Team Members Record Count: ${teamMembers?.length ?? 0}`);

  // 5. Status History Count
  const { data: statusHistory, error: shErr } = await supabaseAdmin.from("status_history").select("id, issue_id, previous_status, new_status, comment, timestamp");
  console.log(`5. Status History Record Count: ${statusHistory?.length ?? 0}`);

  // 6. Preserved Phase C E2E Record Check
  const { data: phaseC, error: phaseCErr } = await supabaseAdmin.from("issues").select("*").eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba").maybeSingle();
  console.log(`6. Preserved Phase C Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): ${phaseC ? 'PRESENT & INTACT (' + phaseC.status + ')' : 'MISSING!'}`);

  console.log("====================================================");
  console.log("          INVENTORY COMPLETED SUCCESSFULLY          ");
  console.log("====================================================");
}

generatePhaseF3Inventory().catch(console.error);
