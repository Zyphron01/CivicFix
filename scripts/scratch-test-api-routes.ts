import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  console.log("=================================================================");
  console.log("DIAGNOSTIC TEST: AUTHENTICATED API REQUESTS AGAINST LIVE ROUTES");
  console.log("=================================================================\n");

  // 1. Get Admin Token
  const adminSignIn = await anonClient.auth.signInWithPassword({
    email: "admin.test@civicfix.local",
    password: "AdminPassword123!",
  });
  if (!adminSignIn.data.session) {
    console.error("Failed to sign in as admin:", adminSignIn.error);
    return;
  }
  const adminToken = adminSignIn.data.session.access_token;
  const adminUserId = adminSignIn.data.user.id;
  console.log(`Admin User ID: ${adminUserId} (${adminSignIn.data.user.email})`);
  console.log(`Admin Token Prefix: ${adminToken.substring(0, 15)}...`);

  // 2. Get Citizen Token
  // Set password for citizen if needed
  await adminClient.auth.admin.updateUserById(
    "a6326e75-0058-49e6-a65c-81f6f5e60f3e",
    { password: "CitizenPassword123!" }
  );
  const citizenSignIn = await anonClient.auth.signInWithPassword({
    email: "citizen.e2e@civicfix.local",
    password: "CitizenPassword123!",
  });
  const citizenToken = citizenSignIn.data.session?.access_token;
  const citizenUserId = citizenSignIn.data.user?.id;
  console.log(`Citizen User ID: ${citizenUserId} (${citizenSignIn.data.user?.email})`);
  console.log(`Citizen Token Prefix: ${citizenToken?.substring(0, 15)}...\n`);

  // Pick an existing issue for testing
  const { data: issues } = await adminClient.from("issues").select("id, status, moderation_status").limit(1);
  const testIssueId = issues && issues.length > 0 ? issues[0].id : "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba";
  console.log(`Test Issue ID: ${testIssueId}\n`);

  // TEST ROUTE 1: /api/admin/moderate with Admin Token
  console.log(">>> [1.1] Testing /api/admin/moderate with Admin Token...");
  const res1Admin = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      newModerationStatus: "ACTIVE",
      reason: "Automated diagnostic moderation test",
    }),
  });
  console.log(`Status: ${res1Admin.status}`);
  console.log(`Response:`, await res1Admin.json());

  // TEST ROUTE 1: /api/admin/moderate with Citizen Token (Should be 403 Forbidden)
  console.log("\n>>> [1.2] Testing /api/admin/moderate with Citizen Token (Expected: 403)...");
  const res1Cit = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${citizenToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      newModerationStatus: "ACTIVE",
      reason: "Citizen unauthorized attempt",
    }),
  });
  console.log(`Status: ${res1Cit.status}`);
  console.log(`Response:`, await res1Cit.json());

  // TEST ROUTE 2: /api/admin/route-department with Admin Token
  console.log("\n>>> [2.1] Testing /api/admin/route-department with Admin Token...");
  const res2Admin = await fetch("http://localhost:3000/api/admin/route-department", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      departmentId: "dept-roads",
      departmentNotes: "Automated diagnostic department routing test",
    }),
  });
  console.log(`Status: ${res2Admin.status}`);
  console.log(`Response:`, await res2Admin.json());

  // TEST ROUTE 2: /api/admin/route-department with Citizen Token (Expected: 403)
  console.log("\n>>> [2.2] Testing /api/admin/route-department with Citizen Token (Expected: 403)...");
  const res2Cit = await fetch("http://localhost:3000/api/admin/route-department", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${citizenToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      departmentId: "dept-roads",
      departmentNotes: "Citizen unauthorized attempt",
    }),
  });
  console.log(`Status: ${res2Cit.status}`);
  console.log(`Response:`, await res2Cit.json());

  // TEST ROUTE 3: /api/department/assign-internal with Admin Token
  console.log("\n>>> [3.1] Testing /api/department/assign-internal with Admin Token...");
  const { data: teams } = await adminClient.from("teams").select("id").limit(1);
  const testTeamId = teams && teams.length > 0 ? teams[0].id : "team-roads-alpha";

  const res3Admin = await fetch("http://localhost:3000/api/department/assign-internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      targetType: "TEAM",
      teamId: testTeamId,
      assignmentNotes: "Automated diagnostic internal assignment test",
    }),
  });
  console.log(`Status: ${res3Admin.status}`);
  console.log(`Response:`, await res3Admin.json());
}

main().catch(console.error);
