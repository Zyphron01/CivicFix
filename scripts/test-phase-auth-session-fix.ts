import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertTest(name: string, condition: boolean, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } else {
    failedTests++;
    console.error(`❌ FAIL: ${name}`);
    if (details) console.error(`   Details: ${details}`);
  }
}

async function runAuthVerification() {
  console.log("================================================================================");
  console.log("CIVICFIX — END-TO-END AUTHENTICATION & SESSION RETRY VERIFICATION");
  console.log("================================================================================\n");

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Admin Sign In
  console.log("1. Authenticating as Municipal Administrator (admin.test@civicfix.local)...");
  const adminSignIn = await anonClient.auth.signInWithPassword({
    email: "admin.test@civicfix.local",
    password: "AdminPassword123!",
  });
  assertTest("1.1 Admin sign in succeeds", !!adminSignIn.data.session, adminSignIn.error?.message);
  const adminToken = adminSignIn.data.session?.access_token || "";
  const adminUserId = adminSignIn.data.user?.id || "";

  // 2. Citizen Sign In
  console.log("\n2. Authenticating as Citizen (citizen.e2e@civicfix.local)...");
  const citizenSignIn = await anonClient.auth.signInWithPassword({
    email: "citizen.e2e@civicfix.local",
    password: "CitizenPassword123!",
  });
  assertTest("2.1 Citizen sign in succeeds", !!citizenSignIn.data.session, citizenSignIn.error?.message);
  const citizenToken = citizenSignIn.data.session?.access_token || "";

  // 3. Field Worker Sign In
  console.log("\n3. Authenticating as Field Worker (worker.test@civicfix.local)...");
  await adminClient.auth.admin.updateUserById(
    "c5f6fd21-6b34-4606-a767-bdae3026c3ab",
    { password: "WorkerPassword123!" }
  );
  const workerSignIn = await anonClient.auth.signInWithPassword({
    email: "worker.test@civicfix.local",
    password: "WorkerPassword123!",
  });
  assertTest("3.1 Field worker sign in succeeds", !!workerSignIn.data.session, workerSignIn.error?.message);
  const workerToken = workerSignIn.data.session?.access_token || "";

  // Fetch a test issue
  const { data: issues } = await adminClient.from("issues").select("id").limit(1);
  const testIssueId = issues && issues.length > 0 ? issues[0].id : "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba";

  // 4. Test Server-side API /api/admin/moderate with Admin Token (Expected: 200)
  console.log("\n4. Testing /api/admin/moderate with Admin Token...");
  const resModAdmin = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      newModerationStatus: "ACTIVE",
      reason: "Automated test validation",
    }),
  });
  assertTest("4.1 /api/admin/moderate returns 200 OK for MUNICIPAL_ADMIN", resModAdmin.status === 200);

  // 5. Test Server-side API /api/admin/route-department with Admin Token (Expected: 200)
  console.log("\n5. Testing /api/admin/route-department with Admin Token...");
  const resRouteAdmin = await fetch("http://localhost:3000/api/admin/route-department", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      departmentId: "dept-roads",
      departmentNotes: "Automated test department routing",
    }),
  });
  assertTest("5.1 /api/admin/route-department returns 200 OK for MUNICIPAL_ADMIN", resRouteAdmin.status === 200);

  // 6. Test Server-side API /api/department/assign-internal with Admin Token (Expected: 200)
  console.log("\n6. Testing /api/department/assign-internal with Admin Token...");
  const { data: teams } = await adminClient.from("teams").select("id").limit(1);
  const testTeamId = teams && teams.length > 0 ? teams[0].id : "team-roads-alpha";

  const resAssignAdmin = await fetch("http://localhost:3000/api/department/assign-internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      targetType: "TEAM",
      teamId: testTeamId,
      assignmentNotes: "Automated test internal assignment",
    }),
  });
  assertTest("6.1 /api/department/assign-internal returns 200 OK for MUNICIPAL_ADMIN", resAssignAdmin.status === 200);

  // 7. Test /api/admin/moderate with Citizen Token (Expected: 403 Forbidden)
  console.log("\n7. Testing /api/admin/moderate with Citizen Token...");
  const resModCit = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${citizenToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      newModerationStatus: "ACTIVE",
    }),
  });
  const citModBody = await resModCit.json().catch(() => ({}));
  assertTest("7.1 Citizen calling /api/admin/moderate returns 403 Forbidden", resModCit.status === 403);
  assertTest("7.2 Forbidden error message clarifies role restriction", citModBody.error?.includes("Forbidden"));

  // 8. Test /api/admin/route-department with Citizen Token (Expected: 403 Forbidden)
  console.log("\n8. Testing /api/admin/route-department with Citizen Token...");
  const resRouteCit = await fetch("http://localhost:3000/api/admin/route-department", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${citizenToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      departmentId: "dept-roads",
    }),
  });
  assertTest("8.1 Citizen calling /api/admin/route-department returns 403 Forbidden", resRouteCit.status === 403);

  // 9. Test Invalid/Malformed Token on protected routes (Expected: 401 Unauthorized)
  console.log("\n9. Testing Invalid/Malformed Token on /api/admin/moderate...");
  const resInvalidToken = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer invalid_token_xyz123",
    },
    body: JSON.stringify({
      issueId: testIssueId,
      newModerationStatus: "ACTIVE",
    }),
  });
  const invalidBody = await resInvalidToken.json().catch(() => ({}));
  assertTest("9.1 Invalid token returns 401 Unauthorized", resInvalidToken.status === 401);
  assertTest("9.2 401 error returns clean 'Unauthorized: Invalid or expired session token.'", invalidBody.error?.includes("Unauthorized"));

  // 10. Test Missing Bearer Header (Expected: 401 Unauthorized)
  console.log("\n10. Testing Missing Bearer Header on /api/admin/moderate...");
  const resMissingHeader = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      issueId: testIssueId,
      newModerationStatus: "ACTIVE",
    }),
  });
  assertTest("10.1 Missing authorization header returns 401 Unauthorized", resMissingHeader.status === 401);

  // 11. Test Field Worker Permissions on /api/department/assign-internal vs /api/admin/moderate
  console.log("\n11. Testing Field Worker permissions...");
  const resWorkerMod = await fetch("http://localhost:3000/api/admin/moderate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${workerToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      newModerationStatus: "ACTIVE",
    }),
  });
  assertTest("11.1 Field worker is forbidden (403) from /api/admin/moderate", resWorkerMod.status === 403);

  const resWorkerAssign = await fetch("http://localhost:3000/api/department/assign-internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${workerToken}`,
    },
    body: JSON.stringify({
      issueId: testIssueId,
      targetType: "TEAM",
      teamId: testTeamId,
      assignmentNotes: "Field worker supervisor assignment",
    }),
  });
  assertTest("11.2 Field worker is permitted (200) to execute /api/department/assign-internal", resWorkerAssign.status === 200);

  console.log("\n================================================================================");
  console.log(`VERIFICATION SUMMARY: ${passedTests}/${totalTests} Tests Passed`);
  if (failedTests > 0) {
    console.error(`FAILED: ${failedTests} Tests Failed`);
    process.exit(1);
  } else {
    console.log("STATUS: ALL AUTHENTICATION & AUTHORIZATION TESTS PASSED");
    console.log("================================================================================");
  }
}

runAuthVerification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
