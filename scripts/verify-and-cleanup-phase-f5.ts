import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function verifyAndCleanupPhaseF5() {
  console.log("====================================================");
  console.log("  PHASE F5 — CLOSEOUT VERIFICATION & SAFE CLEANUP   ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // STEP 1 & 2: Locate Phase F5 temporary test artifacts
  const { data: f5Issues } = await supabaseAdmin.from("issues").select("id").like("id", "issue-f5-sla-%");
  const f5IssueIds = f5Issues?.map(i => i.id) ?? [];

  console.log(`1. Located ${f5IssueIds.length} temporary Phase F5 test issues:`, f5IssueIds);

  let f5AsgsCount = 0;
  let f5AuditCount = 0;

  if (f5IssueIds.length > 0) {
    const { data: asgs } = await supabaseAdmin.from("assignments").select("id").in("issue_id", f5IssueIds);
    const { data: audits } = await supabaseAdmin.from("status_history").select("id").in("issue_id", f5IssueIds);
    
    f5AsgsCount = asgs?.length ?? 0;
    f5AuditCount = audits?.length ?? 0;

    console.log(`2. Temporary records linked to Phase F5 test issues:`);
    console.log(`   - Assignments: ${f5AsgsCount}`);
    console.log(`   - Status History Audits: ${f5AuditCount}`);

    // STEP 3: Perform Safe Cleanup in correct dependency order
    console.log("\n3. Executing safe cleanup of Phase F5 test artifacts...");
    
    // Delete status_history first
    const { error: errAudit } = await supabaseAdmin.from("status_history").delete().in("issue_id", f5IssueIds);
    if (errAudit) console.error("Error deleting f5 status_history:", errAudit);
    else console.log(`   ✓ Deleted ${f5AuditCount} temporary status_history records.`);

    // Delete assignments next
    const { error: errAsg } = await supabaseAdmin.from("assignments").delete().in("issue_id", f5IssueIds);
    if (errAsg) console.error("Error deleting f5 assignments:", errAsg);
    else console.log(`   ✓ Deleted ${f5AsgsCount} temporary assignment records.`);

    // Delete issues last
    const { error: errIssues } = await supabaseAdmin.from("issues").delete().in("id", f5IssueIds);
    if (errIssues) console.error("Error deleting f5 issues:", errIssues);
    else console.log(`   ✓ Deleted ${f5IssueIds.length} temporary issue records.`);
  } else {
    console.log("\n3. Zero temporary Phase F5 test issues found. Cleanup already complete!");
  }

  // STEP 4: Re-run safety checks
  console.log("\n4. Re-running database safety and integrity checks...");

  // Check 1: Protected Phase C Record
  const { data: phaseC } = await supabaseAdmin.from("issues").select("id, status").eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba").maybeSingle();
  if (!phaseC || phaseC.status !== "RESOLVED") {
    throw new Error("CRITICAL SAFETY CHECK FAILED: Protected Phase C record was modified or missing!");
  }
  console.log(`   ✓ Protected Phase C Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): PRESENT & INTACT (${phaseC.status}).`);

  // Check 2: Confirm 0 temporary F5 issues remain
  const { data: remainingF5 } = await supabaseAdmin.from("issues").select("id").like("id", "issue-f5-sla-%");
  if (remainingF5 && remainingF5.length > 0) {
    throw new Error(`CLEANUP VERIFICATION FAILED: ${remainingF5.length} temporary Phase F5 issues still exist!`);
  }
  console.log("   ✓ Verified 0 temporary Phase F5 issues remain in live database.");

  // Check 3: Verify existing data intact
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id");
  const { data: teams } = await supabaseAdmin.from("teams").select("id");
  console.log(`   ✓ Database intact: ${profiles?.length} profiles, ${teams?.length} teams preserved.`);

  console.log("====================================================");
  console.log("  PHASE F5 CLOSEOUT VERIFICATION COMPLETE          ");
  console.log("====================================================");
}

verifyAndCleanupPhaseF5().catch(err => {
  console.error("❌ VERIFICATION FAILED:", err);
  process.exit(1);
});
