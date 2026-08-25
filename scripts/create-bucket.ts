import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createBucket() {
  console.log("Creating civic-evidence storage bucket...");
  
  const { data, error } = await supabase.storage.createBucket("civic-evidence", {
    public: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    fileSizeLimit: 5242880, // 5MB
  });
  
  if (error) {
    console.error(`❌ Failed to create bucket: ${error.message}`);
  } else {
    console.log(`✅ Bucket created: ${data}`);
  }
  
  // Verify bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error(`❌ Failed to list buckets: ${listError.message}`);
  } else {
    const civicEvidence = buckets?.find(b => b.name === "civic-evidence");
    if (civicEvidence) {
      console.log(`✅ civic-evidence bucket verified: EXISTS`);
    } else {
      console.log(`❌ civic-evidence bucket: STILL NOT FOUND`);
    }
  }
}

createBucket().catch(console.error);