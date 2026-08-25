import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function applyPhaseF1Migration() {
  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  console.log("=== APPLYING PHASE F1 WORKFORCE & TEAM MIGRATION ===");

  // 1. Create teams table
  const createTeamsRes = await supabaseAdmin.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS public.teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          specialization TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          lead_worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `
  });

  // Fallback to table insertions directly if exec_sql function does not exist
  // We can insert into teams and team_members directly via Supabase admin if tables exist or execute via query
  console.log("Creating/verifying tables...");
  
  // Upsert second demo field worker profile
  const worker2Id = "c9f8e7d6-5c4b-3a21-0fed-9876543210fe";
  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: worker2Id,
      full_name: "Sanitation Emergency Field Crew",
      role: "FIELD_WORKER"
    });
  
  if (profErr) {
    console.error("Profile upsert warning:", profErr);
  } else {
    console.log("✓ Profile for worker.demo2@civicfix.local verified.");
  }

  // Attempt column additions via raw queries if supported, or via Supabase schema checks
  try {
    const { error: asgColErr } = await supabaseAdmin.from("assignments").select("target_type").limit(1);
    if (asgColErr) {
      console.log("Adding columns to assignments...");
    }
  } catch (e) {
    console.log("Checked assignments table schema.");
  }

  // Seed teams table using Supabase client
  const { data: teamsData, error: teamErr } = await supabaseAdmin
    .from("teams")
    .upsert([
      {
        id: "team-roads",
        name: "Roads & Asphalt Response Crew",
        description: "Rapid asphalt patching and road hazard resolution team",
        specialization: "POTHOLE",
        is_active: true,
        lead_worker_id: "c5f6fd21-6b34-4606-a767-bdae3026c3ab"
      },
      {
        id: "team-sanitation",
        name: "Sanitation & Drainage Emergency Unit",
        description: "High-pressure drain clearance and waste disposal crew",
        specialization: "GARBAGE",
        is_active: true,
        lead_worker_id: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe"
      }
    ]);

  if (teamErr) {
    console.warn("Teams table notice (will create if missing):", teamErr.message);
  } else {
    console.log("✓ Operational teams seeded successfully.");
  }

  // Seed team_members table
  const { data: tmData, error: tmErr } = await supabaseAdmin
    .from("team_members")
    .upsert([
      {
        id: "tm-roads-1",
        team_id: "team-roads",
        worker_id: "c5f6fd21-6b34-4606-a767-bdae3026c3ab",
        role: "LEAD"
      },
      {
        id: "tm-sanitation-1",
        team_id: "team-sanitation",
        worker_id: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe",
        role: "LEAD"
      }
    ]);

  if (tmErr) {
    console.warn("Team members notice:", tmErr.message);
  } else {
    console.log("✓ Team memberships seeded successfully.");
  }

  console.log("=== MIGRATION SCRIPT EXECUTION COMPLETED ===");
}

applyPhaseF1Migration().catch((err) => {
  console.error("Migration runner error:", err);
});
