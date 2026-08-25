import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function deployMigration() {
  console.log("====================================================");
  console.log(" DEPLOYING MODERATION & GPS ADDITIVE MIGRATION     ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // Run DDL queries via Supabase RPC or direct SQL query if available
  // Alternatively execute via postgrest / rpc call or test column presence
  const sqlStatements = [
    `ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'ACTIVE';`,
    `ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS moderation_reason TEXT;`,
    `ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;`,
    `ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS moderated_by UUID;`,
    `ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'MANUAL';`,
    `ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC;`,
    `ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'MANUAL';`,
    `ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC;`,
    `CREATE INDEX IF NOT EXISTS idx_issues_moderation_status ON public.issues (moderation_status);`
  ];

  for (const sql of sqlStatements) {
    try {
      const { error } = await supabaseAdmin.rpc("exec_sql", { sql_query: sql });
      if (error) {
        console.log(`Notice on executing statement (${sql.substring(0, 40)}...):`, error.message);
      } else {
        console.log(`✓ Executed: ${sql.substring(0, 60)}...`);
      }
    } catch (e: any) {
      console.log(`Notice: ${e.message}`);
    }
  }

  // Verify column presence by selecting from issues and reports
  const { data: issueSample, error: issueErr } = await supabaseAdmin.from("issues").select("id, moderation_status, location_source").limit(1);
  const { data: reportSample, error: reportErr } = await supabaseAdmin.from("reports").select("id, location_source").limit(1);

  if (issueErr) console.error("Issue column check error:", issueErr.message);
  else console.log("✓ Verified issues table has moderation_status & location_source:", issueSample);

  if (reportErr) console.error("Report column check error:", reportErr.message);
  else console.log("✓ Verified reports table has location_source:", reportSample);

  console.log("====================================================");
  console.log(" MIGRATION DEPLOYMENT COMPLETE                      ");
  console.log("====================================================");
}

deployMigration().catch(console.error);
