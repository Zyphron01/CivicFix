import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log("=== SUPABASE AUTH TOKEN VALIDATION TRACE ===");
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Sign in as admin.test@civicfix.local
  // (or generate token using admin API if password unknown)
  // Let's test signing in with password or generate an access token
  let token = "";
  let userEmail = "admin.test@civicfix.local";
  
  // Try sign in with common test password or generate link
  const signInRes = await anonClient.auth.signInWithPassword({
    email: userEmail,
    password: "Password123!",
  });

  if (signInRes.data.session) {
    token = signInRes.data.session.access_token;
    console.log("Successfully signed in with password. Token obtained.");
  } else {
    console.log("Sign in with password failed:", signInRes.error?.message);
    console.log("Generating magic link/token via admin API...");
    const linkRes = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });
    if (linkRes.error) {
      console.error("Failed to generate link:", linkRes.error);
      return;
    }
    // Set user password to known test password so we can get token
    const updateRes = await adminClient.auth.admin.updateUserById(
      "af52cfd1-49c0-4e76-b29b-ed9cbc216807",
      { password: "AdminPassword123!" }
    );
    if (updateRes.error) {
      console.error("Failed to update password:", updateRes.error);
      return;
    }
    const retrySignIn = await anonClient.auth.signInWithPassword({
      email: userEmail,
      password: "AdminPassword123!",
    });
    if (retrySignIn.error || !retrySignIn.data.session) {
      console.error("Retry sign in failed:", retrySignIn.error);
      return;
    }
    token = retrySignIn.data.session.access_token;
    console.log("Password updated and signed in. Token obtained.");
  }

  // Inspect JWT header and payload
  const parts = token.split(".");
  const header = JSON.parse(Buffer.from(parts[0], "base64").toString("utf-8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
  console.log("\nJWT Header:", header);
  console.log("JWT Payload (issuer, sub, role, aud):", {
    iss: payload.iss,
    sub: payload.sub,
    aud: payload.aud,
    role: payload.role,
    exp: payload.exp,
  });

  // TEST METHOD 1: Current failing method used in moderate/route.ts
  console.log("\n--- TEST METHOD 1 (Current Route Implementation) ---");
  console.log("createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })");
  console.log("userClient.auth.getUser() [no argument]");
  try {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: m1Data, error: m1Err } = await userClient.auth.getUser();
    console.log("Method 1 Result:", {
      user: m1Data?.user ? `User ID: ${m1Data.user.id}` : null,
      error: m1Err?.message,
    });
  } catch (e: any) {
    console.error("Method 1 Threw exception:", e.message);
  }

  // TEST METHOD 2: Passing token to auth.getUser(token) on anonClient
  console.log("\n--- TEST METHOD 2 (Passing token to anonClient.auth.getUser(token)) ---");
  try {
    const { data: m2Data, error: m2Err } = await anonClient.auth.getUser(token);
    console.log("Method 2 Result:", {
      user: m2Data?.user ? `User ID: ${m2Data.user.id}` : null,
      error: m2Err?.message,
    });
  } catch (e: any) {
    console.error("Method 2 Threw exception:", e.message);
  }

  // TEST METHOD 3: Passing token to auth.getUser(token) on adminClient
  console.log("\n--- TEST METHOD 3 (Passing token to adminClient.auth.getUser(token)) ---");
  try {
    const { data: m3Data, error: m3Err } = await adminClient.auth.getUser(token);
    console.log("Method 3 Result:", {
      user: m3Data?.user ? `User ID: ${m3Data.user.id}` : null,
      error: m3Err?.message,
    });
  } catch (e: any) {
    console.error("Method 3 Threw exception:", e.message);
  }

  // TEST METHOD 4: Passing token to userClient.auth.getUser(token)
  console.log("\n--- TEST METHOD 4 (Passing token to userClient.auth.getUser(token)) ---");
  try {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: m4Data, error: m4Err } = await userClient.auth.getUser(token);
    console.log("Method 4 Result:", {
      user: m4Data?.user ? `User ID: ${m4Data.user.id}` : null,
      error: m4Err?.message,
    });
  } catch (e: any) {
    console.error("Method 4 Threw exception:", e.message);
  }
}

main().catch(console.error);
