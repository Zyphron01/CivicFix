import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testEvidenceUpload() {
  console.log("\n=== CIVIC EVIDENCE UPLOAD TEST ===\n");

  const bucketName = "civic-evidence";

  // Create a small test file in memory
  const testContent = `CivicFix evidence upload test
Created: ${new Date().toISOString()}
This file is only for testing Supabase Storage.`;

  const filePath = `test/evidence-test-${Date.now()}.txt`;

  console.log("Bucket:", bucketName);
  console.log("File path:", filePath);

  // --------------------------------------------------
  // 1. Upload
  // --------------------------------------------------

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, testContent, {
      contentType: "text/plain",
      upsert: false,
    });

  if (uploadError) {
    console.error("\n❌ Upload: FAIL");
    console.error("   Message:", uploadError.message);
    console.error("   Details:", uploadError);
    process.exit(1);
  }

  console.log("\n✅ Upload: PASS");
  console.log("   Path:", uploadData.path);

  // --------------------------------------------------
  // 2. Verify file exists
  // --------------------------------------------------

  const { data: files, error: listError } = await supabase.storage
    .from(bucketName)
    .list("test");

  if (listError) {
    console.error("\n❌ File verification: FAIL");
    console.error("   Message:", listError.message);
    process.exit(1);
  }

  const uploadedFile = files?.find((file) => file.name === filePath.split("/").pop());

  if (!uploadedFile) {
    console.error("\n❌ File verification: FAIL");
    console.error("   Uploaded file was not found in storage.");
    process.exit(1);
  }

  console.log("\n✅ File verification: PASS");
  console.log("   File found:", uploadedFile.name);

  // --------------------------------------------------
  // 3. Generate public URL
  // --------------------------------------------------

  const { data: publicUrlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  console.log("\n✅ Public URL generated:");
  console.log("   ", publicUrlData.publicUrl);

  // --------------------------------------------------
  // 4. Download test
  // --------------------------------------------------

  const { data: downloadedFile, error: downloadError } =
    await supabase.storage.from(bucketName).download(filePath);

  if (downloadError) {
    console.error("\n❌ Download test: FAIL");
    console.error("   Message:", downloadError.message);
    process.exit(1);
  }

  const downloadedText = await downloadedFile.text();

  if (downloadedText !== testContent) {
    console.error("\n❌ Download verification: FAIL");
    console.error("   Downloaded content does not match uploaded content.");
    process.exit(1);
  }

  console.log("\n✅ Download verification: PASS");
  console.log("   Content matches uploaded file.");

  // --------------------------------------------------
  // 5. Delete test file
  // --------------------------------------------------

  const { error: deleteError } = await supabase.storage
    .from(bucketName)
    .remove([filePath]);

  if (deleteError) {
    console.error("\n⚠️ Test file cleanup: FAIL");
    console.error("   Message:", deleteError.message);
  } else {
    console.log("\n✅ Test file cleanup: PASS");
    console.log("   Removed:", filePath);
  }

  console.log("\n=== EVIDENCE UPLOAD TEST COMPLETE ===\n");
}

testEvidenceUpload().catch((error) => {
  console.error("\n❌ Unexpected error:", error);
  process.exit(1);
});