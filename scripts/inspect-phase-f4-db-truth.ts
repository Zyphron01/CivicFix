import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectDatabaseTruth() {
  console.log("====================================================");
  console.log("   PHASE F4 — LIVE DATABASE TRUTH INVESTIGATION     ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // A. Check teams table
  console.log("\n--- A. TEAMS TABLE INVESTIGATION ---");
  const { data: teamsData, error: teamsErr } = await supabaseAdmin.from("teams").select("*");
  if (teamsErr) {
    console.log(`❌ teams table query error: ${teamsErr.message} (Code: ${teamsErr.code})`);
  } else {
    console.log(`✓ teams table exists! Total records: ${teamsData?.length ?? 0}`);
    if (teamsData && teamsData.length > 0) {
      console.log("   Columns:", Object.keys(teamsData[0]));
      console.log("   Teams Records:", teamsData);
    }
  }

  // B. Check team_members table
  console.log("\n--- B. TEAM_MEMBERS TABLE INVESTIGATION ---");
  const { data: tmData, error: tmErr } = await supabaseAdmin.from("team_members").select("*");
  if (tmErr) {
    console.log(`❌ team_members table query error: ${tmErr.message} (Code: ${tmErr.code})`);
  } else {
    console.log(`✓ team_members table exists! Total records: ${tmData?.length ?? 0}`);
    if (tmData && tmData.length > 0) {
      console.log("   Columns:", Object.keys(tmData[0]));
      console.log("   Members Records:", tmData);
    }
  }

  // C. Check assignments table
  console.log("\n--- C. ASSIGNMENTS TABLE INVESTIGATION ---");
  const { data: asgData, error: asgErr } = await supabaseAdmin.from("assignments").select("*");
  if (asgErr) {
    console.log(`❌ assignments query error: ${asgErr.message}`);
  } else {
    console.log(`✓ assignments total records: ${asgData?.length ?? 0}`);
    if (asgData && asgData.length > 0) {
      const sample = asgData[0];
      console.log("   Columns present in live assignments table:", Object.keys(sample));
      
      const supersededCount = asgData.filter((a) => a.notes?.startsWith("SUPERSEDED|")).length;
      const teamNotesCount = asgData.filter((a) => a.notes?.includes("TARGET_TYPE:TEAM")).length;
      const bothTargetCount = asgData.filter((a) => a.field_worker_id && a.team_id).length;
      const neitherTargetCount = asgData.filter((a) => !a.field_worker_id && !a.team_id && !a.notes?.includes("TARGET_TYPE")).length;

      console.log(`   • Superseded records (notes starting SUPERSEDED|): ${supersededCount}`);
      console.log(`   • Team target records in notes: ${teamNotesCount}`);
      console.log(`   • Records with both field_worker_id & team_id set: ${bothTargetCount}`);
      console.log(`   • Records with neither target set: ${neitherTargetCount}`);
    }
  }

  // D. Check issues table columns
  console.log("\n--- D. ISSUES TABLE INVESTIGATION ---");
  const { data: issueData, error: issueErr } = await supabaseAdmin.from("issues").select("*").limit(1);
  if (issueErr) {
    console.log(`❌ issues query error: ${issueErr.message}`);
  } else if (issueData && issueData.length > 0) {
    console.log("   Columns present in live issues table:", Object.keys(issueData[0]));
  }

  // E. Check status_history table
  console.log("\n--- E. STATUS_HISTORY TABLE INVESTIGATION ---");
  const { data: shData, error: shErr } = await supabaseAdmin.from("status_history").select("id, comment").limit(10);
  if (shErr) {
    console.log(`❌ status_history query error: ${shErr.message}`);
  } else {
    console.log(`✓ status_history sample count: ${shData?.length ?? 0}`);
  }

  console.log("\n====================================================");
  console.log("      LIVE DATABASE INVESTIGATION COMPLETE          ");
  console.log("====================================================");
}

inspectDatabaseTruth().catch(console.error);
