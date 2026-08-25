import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function verifyMigrationLogic() {
  console.log("=== TESTING MIGRATION BACKFILL LOGIC ===");
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // Fetch all assignments
  const { data: assignments } = await supabaseAdmin.from("assignments").select("*");
  console.log(`Total assignments: ${assignments?.length}`);

  // Test categorization logic on all 48 rows
  let validIndividual = 0;
  let validTeam = 0;
  let validInactive = 0;
  let invalidRows: any[] = [];

  assignments?.forEach((a) => {
    const notes = a.notes || "";
    let targetType = a.target_type || (notes.includes("TARGET_TYPE:TEAM") ? "TEAM" : "INDIVIDUAL");
    let teamId = a.team_id || (notes.includes("TEAM_ID:team-sanitation") ? "team-sanitation" : notes.includes("TEAM_ID:team-roads") ? "team-roads" : null);
    let isActive = a.is_active;

    if (notes.startsWith("SUPERSEDED|") || notes.startsWith("IS_ACTIVE:FALSE") || (!a.field_worker_id && !teamId)) {
      isActive = false;
    }

    if (isActive === false) {
      validInactive++;
    } else if (targetType === "INDIVIDUAL" && a.field_worker_id && !teamId) {
      validIndividual++;
    } else if (targetType === "TEAM" && teamId && !a.field_worker_id) {
      validTeam++;
    } else {
      invalidRows.push({ id: a.id, field_worker_id: a.field_worker_id, teamId, targetType, isActive, notes });
    }
  });

  console.log("\n--- SIMULATION RESULTS AFTER BACKFILL ---");
  console.log(`Valid Inactive Rows: ${validInactive}`);
  console.log(`Valid Active Individual Rows: ${validIndividual}`);
  console.log(`Valid Active Team Rows: ${validTeam}`);
  console.log(`Invalid Rows Remaining: ${invalidRows.length}`);

  if (invalidRows.length > 0) {
    console.log("Invalid rows details:", invalidRows);
  } else {
    console.log("✓ SUCCESS: 100% of assignment rows satisfy target integrity check after backfill!");
  }
}

verifyMigrationLogic().catch(console.error);
