import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function diagnoseAssignments() {
  console.log("=== DIAGNOSING ASSIGNMENT TARGET INTEGRITY VIOLATIONS ===");
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  const { data: assignments, error } = await supabaseAdmin
    .from("assignments")
    .select("id, issue_id, department_id, field_worker_id, assigned_at, notes");

  if (error) {
    console.error("Error fetching assignments:", error);
    return;
  }

  console.log(`Total assignments found in live DB: ${assignments.length}`);

  let nullWorkerAndNullTeam = 0;
  let bothWorkerAndTeam = 0;
  let legacyTeamNotes = 0;
  let supersededNotes = 0;
  let plainNotes = 0;

  assignments.forEach((a, i) => {
    const notes = a.notes || "";
    const hasWorker = !!a.field_worker_id;
    const isTeamInNotes = notes.includes("TARGET_TYPE:TEAM") || notes.includes("TEAM_ID:");
    const isSuperseded = notes.startsWith("SUPERSEDED|") || notes.startsWith("IS_ACTIVE:FALSE");

    if (!hasWorker && !isTeamInNotes) {
      nullWorkerAndNullTeam++;
      console.log(`[VIOLATION - NO TARGET] Row ${i+1}: ID=${a.id}, issue_id=${a.issue_id}, field_worker_id=${a.field_worker_id}, notes=${notes}`);
    } else if (isTeamInNotes) {
      legacyTeamNotes++;
      console.log(`[TEAM TARGET NOTES] Row ${i+1}: ID=${a.id}, issue_id=${a.issue_id}, field_worker_id=${a.field_worker_id}, notes=${notes}`);
    } else if (isSuperseded) {
      supersededNotes++;
    } else {
      plainNotes++;
    }
  });

  console.log("\n--- SUMMARY DIAGNOSTICS ---");
  console.log(`1. Total assignments: ${assignments.length}`);
  console.log(`2. Rows with NO field_worker_id AND no Team in notes: ${nullWorkerAndNullTeam}`);
  console.log(`3. Rows with TEAM in notes (field_worker_id may be populated or null): ${legacyTeamNotes}`);
  console.log(`4. Superseded assignments: ${supersededNotes}`);
  console.log(`5. Plain individual active assignments: ${plainNotes}`);
}

diagnoseAssignments().catch(console.error);
