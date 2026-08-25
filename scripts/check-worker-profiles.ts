import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function checkWorkerProfiles() {
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  const { data: w1 } = await supabaseAdmin.from("profiles").select("*").eq("id", "c5f6fd21-6b34-4606-a767-bdae3026c3ab").maybeSingle();
  const { data: w2 } = await supabaseAdmin.from("profiles").select("*").eq("id", "c9f8e7d6-5c4b-3a21-0fed-9876543210fe").maybeSingle();

  console.log("Worker 1 in profiles:", !!w1, w1?.full_name);
  console.log("Worker 2 in profiles:", !!w2, w2?.full_name);
}

checkWorkerProfiles().catch(console.error);
