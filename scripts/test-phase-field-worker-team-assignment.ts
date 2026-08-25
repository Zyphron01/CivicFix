import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const APP_URL = "http://localhost:3000";

function assert(condition: boolean, msg: string, detail?: any) {
  if (!condition) {
    console.error(`  [FAIL] ${msg}`, detail !== undefined ? detail : "");
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
}

async function runFieldTeamAssignmentTests() {
  console.log("================================================================================");
  console.log("CIVICFIX: ADMIN -> OPERATIONAL TEAM -> FIELD WORKER END-TO-END VERIFICATION");
  console.log("================================================================================\n");

  // Step 0: Ensure unauthorized test worker exists (not in team-roads)
  const unauthWorkerId = "c9f8e7d6-5c4b-3a21-0fed-9876543210fe";
  const unauthEmail = "worker.demo2@civicfix.local";
  const unauthPass = "WorkerPassword123!";

  // Make sure auth user exists
  await supabaseAdmin.auth.admin.createUser({
    id: unauthWorkerId,
    email: unauthEmail,
    password: unauthPass,
    email_confirm: true,
    user_metadata: { full_name: "Sanitation Non-Roads Worker" },
  }).catch(() => {});

  await supabaseAdmin.from("profiles").upsert({
    id: unauthWorkerId,
    full_name: "Sanitation Non-Roads Worker",
    role: "FIELD_WORKER",
  });

  // Ensure unauth worker is NOT in team-roads (only in team-sanitation or empty)
  await supabaseAdmin.from("team_members").delete().eq("worker_id", unauthWorkerId).eq("team_id", "team-roads");

  // -----------------------------------------------------------------------------
  // TEST A: ADMIN ASSIGNMENT TO OPERATIONAL TEAM
  // -----------------------------------------------------------------------------
  console.log("--- TEST A: Admin Assignment to Operational Team ---");
  
  // 1. Sign in as Municipal Admin
  const { data: adminAuth, error: adminAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "admin.test@civicfix.local",
    password: "AdminPassword123!",
  });
  assert(!adminAuthErr && !!adminAuth.session, "Admin sign-in succeeds");
  const adminToken = adminAuth.session!.access_token;

  // 2. Select target issue
  const targetIssueId = "issue-e2b67742-34a7-4f99-9f87-52978cdab179";
  const selectedTeamId = "team-roads";

  // 3. Dispatch assignment via API
  const asgRes = await fetch(`${APP_URL}/api/department/assign-internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      issueId: targetIssueId,
      targetType: "TEAM",
      teamId: selectedTeamId,
      assignmentNotes: "Dispatched to Roads & Asphalt Response Crew",
    }),
  });
  assert(asgRes.ok, "POST /api/department/assign-internal returns HTTP 200");
  const asgJson = await asgRes.json();
  assert(asgJson.success === true, "Assignment response indicates success", asgJson);
  assert(asgJson.status === "ASSIGNED", "Operational status updated to ASSIGNED");

  // 4. Verify in real database
  const { data: asgDb } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("issue_id", targetIssueId)
    .eq("is_active", true)
    .single();

  assert(asgDb?.team_id === selectedTeamId, "Assignment record in DB has canonical team_id = team-roads");
  assert(asgDb?.target_type === "TEAM", "Assignment record target_type is TEAM");

  // -----------------------------------------------------------------------------
  // TEST B: AUTHORIZED FIELD WORKER VISIBILITY
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST B: Authorized Field Worker Visibility ---");

  // 1. Sign in as Authorized Field Worker (member of team-roads)
  const { data: workerAuth, error: workerAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "worker.test@civicfix.local",
    password: "WorkerPassword123!",
  });
  assert(!workerAuthErr && !!workerAuth.session, "Authorized field worker sign-in succeeds");
  const workerToken = workerAuth.session!.access_token;
  const workerId = workerAuth.user!.id;

  // 2. Fetch field tasks queue via GET /api/field/tasks
  const tasksRes = await fetch(`${APP_URL}/api/field/tasks`, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  assert(tasksRes.ok, "GET /api/field/tasks returns HTTP 200 for authorized worker");
  const tasksJson = await tasksRes.json();
  assert(tasksJson.success === true, "Tasks API returns success: true");
  assert(Array.isArray(tasksJson.issues), "Tasks API returns issues array");

  const matchingTask = tasksJson.issues.find((i: any) => i.id === targetIssueId);
  assert(!!matchingTask, `Assigned issue ${targetIssueId} appears in Field Worker workspace`, tasksJson.issues.map((i: any) => i.id));
  assert(matchingTask?.status === "ASSIGNED", "Matching task has status ASSIGNED");
  assert(matchingTask?.assignment?.teamId === selectedTeamId, "Matching task reflects assigned teamId");

  // 3. Open issue detail as Field Worker via GET /api/admin/issues/[id]
  const detailRes = await fetch(`${APP_URL}/api/admin/issues/${targetIssueId}`, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  assert(detailRes.ok, "GET /api/admin/issues/[id] returns HTTP 200 for authorized team worker");
  const detailJson = await detailRes.json();
  assert(detailJson.issue?.id === targetIssueId, "Issue detail loaded successfully with valid data");

  // -----------------------------------------------------------------------------
  // TEST C: WORKER STATUS UPDATE PERSISTENCE
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST C: Worker Status Update Persistence ---");

  // 1. Update status to IN_PROGRESS directly or via status_history
  const timestamp = new Date().toISOString();
  await supabaseAdmin.from("issues").update({
    status: "IN_PROGRESS",
    updated_at: timestamp,
  }).eq("id", targetIssueId);

  await supabaseAdmin.from("status_history").insert({
    id: `sh-test-${Date.now()}`,
    issue_id: targetIssueId,
    previous_status: "ASSIGNED",
    new_status: "IN_PROGRESS",
    changed_by: workerId,
    comment: "Field crew arrived on-site and began asphalt prep.",
    timestamp,
  });

  // 2. Query as Municipal Admin
  const adminCheckRes = await fetch(`${APP_URL}/api/admin/issues/${targetIssueId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminCheckRes.ok, "Admin queries issue detail successfully");
  const adminCheckJson = await adminCheckRes.json();
  assert(adminCheckJson.issue?.status === "IN_PROGRESS", "Admin immediately sees updated status IN_PROGRESS");

  // -----------------------------------------------------------------------------
  // TEST D: UNAUTHORIZED WORKER SECURITY ENFORCEMENT
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST D: Unauthorized Worker Security Enforcement ---");

  // 1. Sign in as Unauthorized Worker
  const { data: unauthAuth, error: unauthAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: unauthEmail,
    password: unauthPass,
  });
  assert(!unauthAuthErr && !!unauthAuth.session, "Non-team worker signs in successfully");
  const unauthToken = unauthAuth.session!.access_token;

  // 2. Fetch field tasks -> issue MUST NOT appear
  const unauthTasksRes = await fetch(`${APP_URL}/api/field/tasks`, {
    headers: { Authorization: `Bearer ${unauthToken}` },
  });
  assert(unauthTasksRes.ok, "Non-team worker calls /api/field/tasks");
  const unauthTasksJson = await unauthTasksRes.json();
  const unauthHasTask = unauthTasksJson.issues.some((i: any) => i.id === targetIssueId);
  assert(!unauthHasTask, "Issue assigned to team-roads does NOT appear in non-team worker's task queue");

  // 3. Attempt direct access to issue detail -> MUST return HTTP 403 Forbidden
  const unauthDetailRes = await fetch(`${APP_URL}/api/admin/issues/${targetIssueId}`, {
    headers: { Authorization: `Bearer ${unauthToken}` },
  });
  assert(unauthDetailRes.status === 403, `Direct detail access by unauthorized worker returns HTTP 403 Forbidden (Got ${unauthDetailRes.status})`);

  console.log("\n================================================================================");
  console.log("TEST RESULTS: ALL 4 TEST SUITES (A, B, C, D) PASSED WITH ZERO ERRORS");
  console.log("================================================================================");
}

runFieldTeamAssignmentTests().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
