import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";

async function runBaselineInvestigation() {
  console.log("====================================================");
  console.log(" PHASE F7 — BASELINE INVESTIGATION REPORT          ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");

  // 1. Database & Protected Record Verification
  const { data: issues } = await supabaseAdmin.from("issues").select("id, status");
  const { data: reports } = await supabaseAdmin.from("reports").select("id");
  const { data: assignments } = await supabaseAdmin.from("assignments").select("id, is_active");
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, role");
  const { data: phaseC } = await supabaseAdmin
    .from("issues")
    .select("*")
    .eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba")
    .maybeSingle();

  console.log("1. Live Database State:");
  console.log(`   - Issues Count: ${issues?.length ?? 0}`);
  console.log(`   - Reports Count: ${reports?.length ?? 0}`);
  console.log(`   - Assignments Count: ${assignments?.length ?? 0} (${assignments?.filter(a => a.is_active).length ?? 0} active)`);
  console.log(`   - Profiles Count: ${profiles?.length ?? 0}`);
  console.log(`   - Protected Record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba): ${phaseC ? 'PRESENT (' + phaseC.status + ')' : 'MISSING!'}`);

  // 2. Search for supabaseAdmin imports in src/ (Client-side vs Server-side)
  console.log("\n2. Inspecting supabaseAdmin usage in src/ directory:");
  function searchDir(dir: string, pattern: string, results: string[] = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== "node_modules" && file !== ".next" && file !== ".git") {
          searchDir(fullPath, pattern, results);
        }
      } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.includes(pattern)) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  const supabaseAdminMatches = searchDir("src", "supabaseAdmin");
  console.log("   Files referencing supabaseAdmin in src/:");
  supabaseAdminMatches.forEach(f => console.log(`   - ${f}`));

  // 3. Search for hardcoded Bangalore coordinates
  const bangaloreMatches = searchDir("src", "12.9716");
  console.log("\n3. Hardcoded Bangalore coordinate matches (12.9716):");
  bangaloreMatches.forEach(f => console.log(`   - ${f}`));

  // 4. Search for sample after photos / demo images
  const samplePhotoMatches = searchDir("src", "sample");
  console.log("\n4. Sample / Demo photo matches in src/:");
  samplePhotoMatches.forEach(f => console.log(`   - ${f}`));

  console.log("====================================================");
  console.log(" BASELINE INVESTIGATION COMPLETE                    ");
  console.log("====================================================");
}

runBaselineInvestigation().catch(console.error);
