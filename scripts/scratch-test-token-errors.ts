import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  
  // 1. Test with fake/invalid token
  console.log("1. Testing getUser with invalid token string:");
  const res1 = await userClient.auth.getUser("invalid-token-12345");
  console.log("Result 1:", { user: res1.data.user, error: res1.error?.message, status: res1.error?.status });

  // 2. Test with malformed header
  console.log("\n2. Testing HTTP route with invalid token:");
  const httpRes = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer invalid-token-12345",
    },
    body: JSON.stringify({ issueId: "issue-1", newModerationStatus: "ACTIVE" }),
  });
  console.log("HTTP Status:", httpRes.status);
  console.log("HTTP Body:", await httpRes.json());
}

main().catch(console.error);
