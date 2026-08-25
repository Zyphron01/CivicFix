import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function validateExistingAssignments() {
  console.log("=== SCANNING EXISTING ASSIGNMENTS FOR COMPATIBILITY ===");
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  const { data: assignments, error } = await supabaseAdmin.from("assignments").select("*");
  if (error) {
    console.error("Failed to fetch assignments:", error);
    process.exit(1);
  }

  console.log(`Total existing assignments scanned: ${assignments?.length ?? 0}`);

  let validCount = 0;
  let invalidCount = 0;
  const invalidRows: any[] = [];

  assignments?.forEach((a) => {
    const hasWorker = !!a.field_worker_id;
    const hasTeamNote = a.notes?.includes("TARGET_TYPE:TEAM");
    const hasIndNote = a.notes?.includes("TARGET_TYPE:INDIVIDUAL");

    // Standard valid state: either field_worker_id is set OR notes indicates TEAM assignment OR test dummy record
    if (hasWorker || hasTeamNote || hasIndNote) {
      validCount++;
    } else {
      invalidCount++;
      invalidRows.push(a);
    }
  });

  console.log(`✓ Valid Compatible Assignments: ${validCount}`);
  console.log(`! Ambiguous / Legacy Assignments: ${invalidCount}`);
  if (invalidRows.length > 0) {
    console.log("Sample Ambiguous Rows:", invalidRows.slice(0, 3));
  }

  console.log("Compatibility Scan Finished Cleanly. NO records modified.");
}

validateExistingAssignments().catch(console.error);
