import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectPhaseF44LiveIntegrity() {
  console.log("====================================================");
  console.log(" PHASE F4.4 — LIVE DATABASE TRUTH INSPECTION      ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Check public.teams
  const { data: teams, error: teamsErr } = await supabaseAdmin.from("teams").select("*");
  console.log("1. public.teams table exists live:", !teamsErr, teamsErr ? teamsErr.message : `(${teams?.length} records found)`);

  // 2. Check public.team_members
  const { data: members, error: membersErr } = await supabaseAdmin.from("team_members").select("*");
  console.log("2. public.team_members table exists live:", !membersErr, membersErr ? membersErr.message : `(${members?.length} records found)`);

  // 3. Inspect assignments columns & rows
  const { data: assignments, error: asgErr } = await supabaseAdmin.from("assignments").select("*");
  if (asgErr) {
    console.error("Error querying assignments table:", asgErr);
    return;
  }

  console.log(`3. Total assignments in live DB: ${assignments.length}`);

  const sampleRow = assignments[0] || {};
  const presentCols = Object.keys(sampleRow);
  console.log("   Columns present in public.assignments:", presentCols);
  console.log("   - is_active present:", "is_active" in sampleRow);
  console.log("   - superseded_at present:", "superseded_at" in sampleRow);
  console.log("   - superseded_by_assignment_id present:", "superseded_by_assignment_id" in sampleRow);
  console.log("   - target_type present:", "target_type" in sampleRow);
  console.log("   - team_id present:", "team_id" in sampleRow);

  let activeCount = 0;
  let inactiveCount = 0;
  let validCount = 0;
  let invalidCount = 0;
  const invalidRows: any[] = [];

  assignments.forEach((a) => {
    const notes = a.notes || "";
    const isActive = a.is_active;
    const targetType = a.target_type;
    const workerId = a.field_worker_id;
    const teamId = a.team_id;

    if (isActive === true) activeCount++;
    else if (isActive === false) inactiveCount++;

    // Evaluate target integrity rule:
    // INDIVIDUAL: target_type = 'INDIVIDUAL' AND workerId IS NOT NULL AND teamId IS NULL
    // TEAM: target_type = 'TEAM' AND teamId IS NOT NULL AND workerId IS NULL
    // INACTIVE: (if rule allows inactive rows)
    const isValidIndiv = targetType === "INDIVIDUAL" && workerId !== null && teamId === null;
    const isValidTeam = targetType === "TEAM" && teamId !== null && workerId === null;

    if (isValidIndiv || isValidTeam || isActive === false) {
      validCount++;
    } else {
      invalidCount++;
      invalidRows.push({
        id: a.id,
        issue_id: a.issue_id,
        field_worker_id: workerId,
        team_id: teamId,
        target_type: targetType,
        is_active: isActive,
        notes: notes,
      });
    }
  });

  console.log(`\n4. Assignment Integrity Breakdown:`);
  console.log(`   - Total Assignments: ${assignments.length}`);
  console.log(`   - Active Assignments (is_active = true): ${activeCount}`);
  console.log(`   - Inactive Assignments (is_active = false): ${inactiveCount}`);
  console.log(`   - Valid Rows: ${validCount}`);
  console.log(`   - Invalid Rows violating Target Integrity: ${invalidCount}`);

  if (invalidCount > 0) {
    console.log("\n   EXACT INVALID ROWS:");
    invalidRows.forEach((r, idx) => {
      console.log(`   [${idx + 1}] ID: ${r.id} | issue_id: ${r.issue_id} | worker: ${r.field_worker_id} | team: ${r.team_id} | type: ${r.target_type} | active: ${r.is_active} | notes: "${r.notes}"`);
    });
  }

  // 5. Check Protected Phase C Issue
  const { data: phaseCIssue } = await supabaseAdmin.from("issues").select("*").eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba").maybeSingle();
  console.log(`\n5. Protected Phase C Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): ${phaseCIssue ? 'PRESENT & INTACT (' + phaseCIssue.status + ')' : 'MISSING!'}`);

  console.log("====================================================");
  console.log(" PHASE F4.4 — LIVE INSPECTION COMPLETE             ");
  console.log("====================================================");
}

inspectPhaseF44LiveIntegrity().catch(console.error);
