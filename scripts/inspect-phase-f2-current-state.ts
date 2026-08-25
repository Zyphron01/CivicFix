import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectCurrentState() {
  console.log("=== PHASE F2 CURRENT STATE INSPECTION ===");
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Teams count & details
  const { data: teams, error: teamsErr } = await supabaseAdmin.from("teams").select("*");
  console.log(`1. Teams count: ${teams?.length ?? 0}`);
  if (teamsErr) console.warn("Teams fetch note:", teamsErr.message);
  else console.log("Teams:", teams);

  // 2. Team Members count & details
  const { data: members, error: membersErr } = await supabaseAdmin.from("team_members").select("*");
  console.log(`2. Team Members count: ${members?.length ?? 0}`);
  if (membersErr) console.warn("Members fetch note:", membersErr.message);
  else console.log("Members:", members);

  // 3. Profiles count & roles
  const { data: profiles, error: profErr } = await supabaseAdmin.from("profiles").select("*");
  console.log(`3. Total Profiles count: ${profiles?.length ?? 0}`);
  if (profErr) console.warn("Profiles fetch note:", profErr.message);
  else {
    const workers = profiles?.filter((p) => p.role === "FIELD_WORKER");
    console.log(`FIELD_WORKER profiles count: ${workers?.length ?? 0}`);
    workers?.forEach((w) => console.log(`  • Worker: ${w.full_name} (${w.id})`));
  }

  // 4. Assignments count & target breakdown
  const { data: assignments, error: asgErr } = await supabaseAdmin.from("assignments").select("*");
  console.log(`4. Total Assignments count: ${assignments?.length ?? 0}`);
  if (asgErr) console.warn("Assignments fetch note:", asgErr.message);
  else {
    assignments?.forEach((a) => {
      console.log(`  • Asg ${a.id}: Issue ${a.issue_id} | TargetType: ${a.target_type || 'N/A'} | Worker: ${a.field_worker_id || 'null'} | Team: ${a.team_id || 'null'} | Notes: ${a.notes || 'none'}`);
    });
  }

  // 5. Status History count & sample reassignment records
  const { data: history, error: shErr } = await supabaseAdmin.from("status_history").select("*").order("timestamp", { ascending: false }).limit(10);
  console.log(`5. Recent Status History count: ${history?.length ?? 0}`);
  if (shErr) console.warn("History fetch note:", shErr.message);
  else {
    history?.forEach((h) => {
      console.log(`  • SH ${h.id}: Issue ${h.issue_id} | ${h.previous_status || 'INIT'} -> ${h.new_status} | By: ${h.changed_by} | Comment: ${h.comment || 'none'}`);
    });
  }
}

inspectCurrentState().catch(console.error);
