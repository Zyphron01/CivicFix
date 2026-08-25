import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectPhaseF5Baseline() {
  console.log("====================================================");
  console.log("  PHASE F5 — BASELINE LIVE STATE INSPECTION         ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Profiles
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, role");
  console.log(`1. Profiles (${profiles?.length} total):`);
  profiles?.forEach(p => console.log(`   - ${p.full_name} (${p.role}) ID: ${p.id}`));

  // 2. Teams & Members
  const { data: teams } = await supabaseAdmin.from("teams").select(`
    *,
    team_members (*)
  `);
  console.log(`2. Teams (${teams?.length} total):`);
  teams?.forEach(t => console.log(`   - Team: ${t.name} (${t.id}), Lead: ${t.lead_worker_id}, Spec: ${t.specialization}, Members: ${t.team_members?.length}`));

  // 3. Assignments SLA / Target resolution dates
  const { data: assignments } = await supabaseAdmin.from("assignments").select("id, issue_id, target_type, team_id, field_worker_id, is_active, assigned_at, target_resolution_date");
  const activeAssignments = assignments?.filter(a => a.is_active === true) ?? [];
  console.log(`3. Assignments (${assignments?.length} total, ${activeAssignments.length} active):`);
  
  // 4. Inspect columns present in issues table
  const { data: sampleIssue } = await supabaseAdmin.from("issues").select("*").limit(1).single();
  console.log("4. Sample Issue columns:", Object.keys(sampleIssue ?? {}));

  // 5. Protected Phase C Record
  const { data: phaseCIssue } = await supabaseAdmin.from("issues").select("*").eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba").maybeSingle();
  console.log(`5. Protected Phase C Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): ${phaseCIssue ? 'PRESENT & INTACT (' + phaseCIssue.status + ')' : 'MISSING!'}`);

  console.log("====================================================");
  console.log("  PHASE F5 BASELINE INSPECTION COMPLETE             ");
  console.log("====================================================");
}

inspectPhaseF5Baseline().catch(console.error);
