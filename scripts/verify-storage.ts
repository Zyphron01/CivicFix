import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase environment variables");
  process.exit(1);
}

console.log("Configured Supabase URL:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET = "civic-evidence";

async function verifyStorage() {
  console.log("\n=== STORAGE VERIFICATION ===\n");

  // --------------------------------------------------
  // 1. Test the known bucket directly
  // --------------------------------------------------

  console.log(`Checking bucket: ${BUCKET}`);

  const { data: files, error: filesError } = await supabase.storage
    .from(BUCKET)
    .list("", {
      limit: 10,
    });

  if (filesError) {
    console.error("\n❌ Storage access test: FAIL");
    console.error("   Message:", filesError.message);
    console.error("   Details:", filesError);

    console.log("\nPossible causes:");
    console.log("1. Storage policy is missing");
    console.log("2. The current user is not authenticated");
    console.log("3. Bucket name is incorrect");
    console.log("4. Storage access is blocked by RLS");

    return;
  }

  console.log("\n✅ civic-evidence bucket: ACCESSIBLE");
  console.log("   Files/folders:", files?.length || 0);

  if (files && files.length > 0) {
    console.log("\nExisting objects:");

    files.forEach((file) => {
      console.log(`   - ${file.name}`);
    });
  } else {
    console.log("   Bucket is currently empty.");
  }

  // --------------------------------------------------
  // 2. Test public URL generation
  // --------------------------------------------------

  const testPath = "test-storage-verification.txt";

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(testPath);

  if (publicUrlData?.publicUrl) {
    console.log("\n✅ Public URL generation: PASS");
    console.log("   URL generated successfully.");
  } else {
    console.log("\n❌ Public URL generation: FAIL");
  }

  // --------------------------------------------------
  // 3. Database verification
  // --------------------------------------------------

  console.log("\n=== DATABASE VERIFICATION ===\n");

  const tables = [
    "issues",
    "reports",
    "assignments",
    "status_history",
    "resolution_evidence",
    "verification_results",
  ];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .limit(1);

    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
    } else {
      console.log(
        `✅ ${table}: ACCESSIBLE (${data?.length || 0} rows in sample)`
      );
    }
  }

  console.log("\n=== VERIFICATION COMPLETE ===\n");
}

verifyStorage().catch((error) => {
  console.error("\n❌ Unexpected verification error:");
  console.error(error);
  process.exit(1);
});