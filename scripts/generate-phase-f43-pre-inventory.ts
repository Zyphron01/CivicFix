import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runPhaseF43PreInventory() {
  console.log("====================================================");
  console.log("   PHASE F4.3 — PRE-DEPLOYMENT BACKUP INVENTORY     ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Profiles
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, role");
  console.log(`1. Profiles count: ${profiles?.length ?? 0}`);

  // 2. Issues
  const { data: issues } = await supabaseAdmin.from("issues").select("id, status");
  console.log(`2. Issues count: ${issues?.length ?? 0}`);

  // 3. Reports
  const { data: reports } = await supabaseAdmin.from("reports").select("id");
  console.log(`3. Reports count: ${reports?.length ?? 0}`);

  // 4. Assignments
  const { data: assignments } = await supabaseAdmin.from("assignments").select("*");
  console.log(`4. Assignments count: ${assignments?.length ?? 0}`);

  const nullNotes = assignments?.filter((a) => a.notes === null).length ?? 0;
  const supersededNotes = assignments?.filter((a) => a.notes?.startsWith("SUPERSEDED|")).length ?? 0;
  const teamTargetNotes = assignments?.filter((a) => a.notes?.includes("TARGET_TYPE:TEAM")).length ?? 0;

  // Count issues with multiple assignment records
  const issueAsgCounts: Record<string, number> = {};
  assignments?.forEach((a) => {
    issueAsgCounts[a.issue_id] = (issueAsgCounts[a.issue_id] || 0) + 1;
  });
  const multiAsgIssueCount = Object.values(issueAsgCounts).filter((c) => c > 1).length;

  console.log(`   • Assignments with NULL notes: ${nullNotes}`);
  console.log(`   • Assignments starting with SUPERSEDED|: ${supersededNotes}`);
  console.log(`   • Assignments containing TARGET_TYPE:TEAM: ${teamTargetNotes}`);
  console.log(`   • Distinct issue IDs with >1 assignment records: ${multiAsgIssueCount}`);

  // 5. Status History
  const { data: statusHistory } = await supabaseAdmin.from("status_history").select("id");
  console.log(`5. Status History count: ${statusHistory?.length ?? 0}`);

  // 6. Resolution Evidence
  const { data: evidence } = await supabaseAdmin.from("resolution_evidence").select("id");
  console.log(`6. Resolution Evidence count: ${evidence?.length ?? 0}`);

  // 7. Verification Results
  const { data: verification } = await supabaseAdmin.from("verification_results").select("id");
  console.log(`7. Verification Results count: ${verification?.length ?? 0}`);

  // 8. Protected Phase C Issue
  const { data: phaseCIssue } = await supabaseAdmin.from("issues").select("*").eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba").maybeSingle();
  console.log(`8. Protected Phase C Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): ${phaseCIssue ? 'PRESENT & INTACT (' + phaseCIssue.status + ')' : 'MISSING!'}`);

  console.log("====================================================");
  console.log("   PRE-DEPLOYMENT BACKUP INVENTORY COMPLETE         ");
  console.log("====================================================");
}

runPhaseF43PreInventory().catch(console.error);
