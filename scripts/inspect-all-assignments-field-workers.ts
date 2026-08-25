import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function inspectAssignmentsFieldWorkers() {
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  
  const { data: assignments } = await supabaseAdmin.from("assignments").select("id, field_worker_id");
  console.log("Total assignments:", assignments?.length);

  const workerIds = new Set<string>();
  assignments?.forEach((a) => {
    if (a.field_worker_id) workerIds.add(a.field_worker_id);
  });

  console.log("Distinct field_worker_id values in assignments:", Array.from(workerIds));

  // Check if all distinct field_worker_id values are valid UUIDs or if any are text like 'field-test'
  const invalidUuids: string[] = [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  Array.from(workerIds).forEach((id) => {
    if (!uuidRegex.test(id)) {
      invalidUuids.push(id);
    }
  });

  console.log("Non-UUID field_worker_id values found in assignments:", invalidUuids);

  // Check existing profiles
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, role");
  console.log("\nExisting Profiles in DB:");
  profiles?.forEach((p) => console.log(` - ID: ${p.id} (${p.full_name}, ${p.role})`));
}

inspectAssignmentsFieldWorkers().catch(console.error);
