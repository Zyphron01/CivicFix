import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runPreInvestigation() {
  console.log("====================================================");
  console.log("  PHASE F5 — PRE-IMPLEMENTATION LIVE INVESTIGATION  ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Table Record Counts
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, role");
  const { data: issues } = await supabaseAdmin.from("issues").select("*");
  const { data: reports } = await supabaseAdmin.from("reports").select("id");
  const { data: assignments } = await supabaseAdmin.from("assignments").select("*");
  const { data: teams } = await supabaseAdmin.from("teams").select("*, team_members(*)");
  const { data: members } = await supabaseAdmin.from("team_members").select("*");
  const { data: statusHistory } = await supabaseAdmin.from("status_history").select("id");
  const { data: evidence } = await supabaseAdmin.from("resolution_evidence").select("id");
  const { data: verification } = await supabaseAdmin.from("verification_results").select("id");

  console.log(`1. Record Counts:`);
  console.log(`   - profiles: ${profiles?.length ?? 0}`);
  console.log(`   - issues: ${issues?.length ?? 0}`);
  console.log(`   - reports: ${reports?.length ?? 0}`);
  console.log(`   - assignments: ${assignments?.length ?? 0}`);
  console.log(`   - teams: ${teams?.length ?? 0}`);
  console.log(`   - team_members: ${members?.length ?? 0}`);
  console.log(`   - status_history: ${statusHistory?.length ?? 0}`);
  console.log(`   - resolution_evidence: ${evidence?.length ?? 0}`);
  console.log(`   - verification_results: ${verification?.length ?? 0}`);

  // 2. Active vs Inactive assignments
  const activeAsg = assignments?.filter(a => a.is_active === true) ?? [];
  const inactiveAsg = assignments?.filter(a => a.is_active === false) ?? [];
  console.log(`\n2. Assignments Breakdown:`);
  console.log(`   - Active Assignments (is_active = true): ${activeAsg.length}`);
  console.log(`   - Inactive Assignments (is_active = false): ${inactiveAsg.length}`);

  // 3. NULL vs non-NULL target_resolution_date
  const nullTargetDates = assignments?.filter(a => a.target_resolution_date === null).length ?? 0;
  const nonNullTargetDates = assignments?.filter(a => a.target_resolution_date !== null).length ?? 0;
  console.log(`\n3. Target Resolution Date Breakdown:`);
  console.log(`   - Assignments with NULL target_resolution_date: ${nullTargetDates}`);
  console.log(`   - Assignments with non-NULL target_resolution_date: ${nonNullTargetDates}`);

  // 4. Issue Priority Data Inspection
  const sampleIssue = issues?.[0] || {};
  console.log(`\n4. Issues Table Schema Inspection:`);
  console.log(`   - Issue Columns:`, Object.keys(sampleIssue));
  
  const distinctPriorityLevels = new Set<string>();
  const distinctPriorityScores = new Set<number>();

  issues?.forEach(i => {
    if (i.priority_level) distinctPriorityLevels.add(i.priority_level);
    if (i.priority_score !== undefined && i.priority_score !== null) distinctPriorityScores.add(i.priority_score);
  });

  console.log(`   - Distinct priority_level values:`, Array.from(distinctPriorityLevels));
  console.log(`   - Sample priority_score values:`, Array.from(distinctPriorityScores).slice(0, 10));

  // 5. Inspect Teams & Members
  console.log(`\n5. Teams & Membership Inspection:`);
  teams?.forEach(t => {
    console.log(`   - Team: "${t.name}" (${t.id}) | Specialization: ${t.specialization} | Lead: ${t.lead_worker_id}`);
    console.log(`     Members:`, t.team_members);
  });

  // 6. Check Protected Record
  const { data: phaseCIssue } = await supabaseAdmin.from("issues").select("*").eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba").maybeSingle();
  console.log(`\n6. Protected Phase C Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): ${phaseCIssue ? 'PRESENT & INTACT (' + phaseCIssue.status + ')' : 'MISSING!'}`);

  console.log("====================================================");
  console.log(" PHASE F5 PRE-INVESTIGATION COMPLETE               ");
  console.log("====================================================");
}

runPreInvestigation().catch(console.error);
