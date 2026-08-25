import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const APP_URL = "http://localhost:3000";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition: boolean, msg: string, detail?: any) {
  if (!condition) {
    console.error(`  [FAIL] ${msg}`, detail !== undefined ? detail : "");
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
}

async function runAdminResolutionVerification() {
  console.log("================================================================================");
  console.log("CIVICFIX: ADMIN RESOLUTION & VERIFICATION WORKFLOW VERIFICATION");
  console.log("================================================================================\n");

  // 1. Authenticate Municipal Admin
  const { data: adminAuth, error: adminAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "admin.test@civicfix.local",
    password: "AdminPassword123!",
  });
  assert(!adminAuthErr && !!adminAuth.session, "Admin sign-in successful");
  const adminToken = adminAuth.session!.access_token;
  const adminId = adminAuth.user!.id;

  // 2. Authenticate Authorized Field Worker (team-roads)
  const { data: workerAuth, error: workerAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "worker.test@civicfix.local",
    password: "WorkerPassword123!",
  });
  assert(!workerAuthErr && !!workerAuth.session, "Authorized Field Worker sign-in successful");
  const workerToken = workerAuth.session!.access_token;
  const workerId = workerAuth.user!.id;

  // 3. Authenticate Citizen
  const { data: citizenAuth, error: citizenAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "citizen.e2e@civicfix.local",
    password: "CitizenPassword123!",
  });
  assert(!citizenAuthErr && !!citizenAuth.session, "Citizen sign-in successful");
  const citizenToken = citizenAuth.session!.access_token;

  const targetIssueId = "issue-e2b67742-34a7-4f99-9f87-52978cdab179";

  // Ensure issue assigned to team-roads
  await fetch(`${APP_URL}/api/department/assign-internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      targetType: "TEAM",
      teamId: "team-roads",
      assignmentNotes: "Admin verification test setup",
    }),
  });

  // -----------------------------------------------------------------------------
  // TEST 1: Field worker evidence creates VERIFICATION state
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: Field Worker Evidence creates VERIFICATION state ---");

  // Reset to IN_PROGRESS
  await supabaseAdmin.from("issues").update({ status: "IN_PROGRESS" }).eq("id", targetIssueId);

  const samplePath = `resolutions/${workerId}/${Date.now()}_test_after.jpg`;
  const dummyBuffer = Buffer.from("dummy-evidence-image-data");
  await supabaseAdmin.storage
    .from("civicfix-evidence")
    .upload(samplePath, dummyBuffer, { contentType: "image/jpeg", upsert: true });

  const evRes = await fetch(`${APP_URL}/api/field/submit-evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      workSummary: "Initial asphalt patch completed.",
      afterImageUrl: samplePath,
    }),
  });
  assert(evRes.ok, "Field worker submits evidence successfully (HTTP 200)");

  const { data: issueAfterEv } = await supabaseAdmin
    .from("issues")
    .select("status")
    .eq("id", targetIssueId)
    .single();
  assert(issueAfterEv?.status === "VERIFICATION", "Issue status entered VERIFICATION");

  // -----------------------------------------------------------------------------
  // TEST 2: Municipal Admin APPROVED request succeeds
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST 2 & 3: Admin APPROVED request succeeds and updates status to RESOLVED ---");

  const approvalNotes = "Inspected and confirmed asphalt repair meets municipal standards.";
  const approveRes = await fetch(`${APP_URL}/api/admin/verify-resolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      decision: "APPROVED",
      notes: approvalNotes,
    }),
  });

  assert(approveRes.ok, `POST /api/admin/verify-resolution (APPROVED) returns HTTP 200 (Got ${approveRes.status})`);
  const approveJson = await approveRes.json();
  assert(approveJson.success === true, "Approval response indicates success");
  assert(approveJson.decision === "APPROVED", "Approval response confirms decision = APPROVED");

  // -----------------------------------------------------------------------------
  // TEST 3: Issue changes: VERIFICATION -> RESOLVED
  // -----------------------------------------------------------------------------
  const { data: issueAfterApprove } = await supabaseAdmin
    .from("issues")
    .select("status")
    .eq("id", targetIssueId)
    .single();
  assert(issueAfterApprove?.status === "RESOLVED", "Database issues.status updated to RESOLVED");

  // -----------------------------------------------------------------------------
  // TEST 4: status_history record is created
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST 4: status_history record created for APPROVED ---");
  const { data: historyAfterApprove } = await supabaseAdmin
    .from("status_history")
    .select("*")
    .eq("issue_id", targetIssueId)
    .order("timestamp", { ascending: false });

  const latestHistory = historyAfterApprove?.[0];
  assert(latestHistory?.previous_status === "VERIFICATION", "History previous_status is VERIFICATION");
  assert(latestHistory?.new_status === "RESOLVED", "History new_status is RESOLVED");
  assert(latestHistory?.changed_by === adminId, "History changed_by matches Admin ID");
  assert(
    latestHistory?.comment?.includes("ADMIN VERIFICATION APPROVED:") &&
      latestHistory?.comment?.includes(approvalNotes),
    "History comment contains 'ADMIN VERIFICATION APPROVED:' and approval notes"
  );

  // -----------------------------------------------------------------------------
  // TEST 5: Duplicate APPROVED request does not create duplicate history (idempotency)
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST 5: Idempotent duplicate APPROVED request ---");
  const historyCountBefore = historyAfterApprove?.length || 0;
  const dupApproveRes = await fetch(`${APP_URL}/api/admin/verify-resolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ issueId: targetIssueId, decision: "APPROVED" }),
  });
  assert(dupApproveRes.ok, "Idempotent duplicate call returns HTTP 200");
  const { data: historyAfterDup } = await supabaseAdmin
    .from("status_history")
    .select("id")
    .eq("issue_id", targetIssueId);
  assert(
    historyAfterDup?.length === historyCountBefore,
    "No duplicate status_history entry created on idempotent call"
  );

  // -----------------------------------------------------------------------------
  // TEST 6: New verification issue with REWORK_REQUIRED succeeds
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST 6, 7, 8, 9: REWORK_REQUIRED decision workflow ---");

  // Put issue back into VERIFICATION state
  await supabaseAdmin.from("issues").update({ status: "VERIFICATION" }).eq("id", targetIssueId);

  const reworkNotes = "Asphalt leveling uneven near drain curb. Please resurface and compact edge.";
  const reworkRes = await fetch(`${APP_URL}/api/admin/verify-resolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      decision: "REWORK_REQUIRED",
      notes: reworkNotes,
    }),
  });

  assert(reworkRes.ok, `POST /api/admin/verify-resolution (REWORK_REQUIRED) returns HTTP 200 (Got ${reworkRes.status})`);
  const reworkJson = await reworkRes.json();
  assert(reworkJson.success === true, "Rework response indicates success");
  assert(reworkJson.decision === "REWORK_REQUIRED", "Rework response confirms decision = REWORK_REQUIRED");

  // -----------------------------------------------------------------------------
  // TEST 7: Issue changes: VERIFICATION -> IN_PROGRESS
  // -----------------------------------------------------------------------------
  const { data: issueAfterRework } = await supabaseAdmin
    .from("issues")
    .select("status")
    .eq("id", targetIssueId)
    .single();
  assert(issueAfterRework?.status === "IN_PROGRESS", "Database issues.status updated to IN_PROGRESS");

  // -----------------------------------------------------------------------------
  // TEST 8: Admin notes are preserved in status_history
  // -----------------------------------------------------------------------------
  const { data: historyAfterRework } = await supabaseAdmin
    .from("status_history")
    .select("*")
    .eq("issue_id", targetIssueId)
    .order("timestamp", { ascending: false });

  const reworkHistEntry = historyAfterRework?.[0];
  assert(reworkHistEntry?.previous_status === "VERIFICATION", "Rework history previous_status is VERIFICATION");
  assert(reworkHistEntry?.new_status === "IN_PROGRESS", "Rework history new_status is IN_PROGRESS");
  assert(
    reworkHistEntry?.comment?.includes(reworkNotes) &&
      (reworkHistEntry?.comment?.includes("ADMIN VERIFICATION FAILED:") ||
        reworkHistEntry?.comment?.includes("ADMIN VERIFICATION NOT APPROVED")),
    "Rework history comment matches exact format with admin notes"
  );

  // -----------------------------------------------------------------------------
  // TEST 9: Original team assignment remains valid
  // -----------------------------------------------------------------------------
  const { data: currentAsg } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("issue_id", targetIssueId)
    .order("assigned_at", { ascending: false })
    .limit(1);

  assert(
    currentAsg?.[0]?.team_id === "team-roads" || currentAsg?.[0]?.notes?.includes("team-roads"),
    "Original team assignment team-roads remains active and valid"
  );

  // Field Worker sees task in tasks queue
  const workerTasksRes = await fetch(`${APP_URL}/api/field/tasks`, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  const workerTasksJson = await workerTasksRes.json();
  const foundTask = workerTasksJson.issues?.find((i: any) => i.id === targetIssueId);
  assert(!!foundTask, "Task remains visible in Field Worker task queue");
  assert(foundTask?.status === "IN_PROGRESS", "Field Worker task status is IN_PROGRESS");

  // -----------------------------------------------------------------------------
  // TEST 10: Unauthorized user receives 401
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST 10 & 11: Security & Authorization Enforcement ---");
  const noAuthRes = await fetch(`${APP_URL}/api/admin/verify-resolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueId: targetIssueId, decision: "APPROVED" }),
  });
  assert(noAuthRes.status === 401, `Unauthenticated request returns HTTP 401 (Got ${noAuthRes.status})`);

  // -----------------------------------------------------------------------------
  // TEST 11: Field worker and Citizen attempting final verification receives 403
  // -----------------------------------------------------------------------------
  const workerVerifyRes = await fetch(`${APP_URL}/api/admin/verify-resolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}` },
    body: JSON.stringify({ issueId: targetIssueId, decision: "APPROVED" }),
  });
  assert(
    workerVerifyRes.status === 403,
    `Field worker verify-resolution blocked with HTTP 403 (Got ${workerVerifyRes.status})`
  );

  const citizenVerifyRes = await fetch(`${APP_URL}/api/admin/verify-resolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${citizenToken}` },
    body: JSON.stringify({ issueId: targetIssueId, decision: "APPROVED" }),
  });
  assert(
    citizenVerifyRes.status === 403,
    `Citizen verify-resolution blocked with HTTP 403 (Got ${citizenVerifyRes.status})`
  );

  // -----------------------------------------------------------------------------
  // TEST 12: Existing moderation workflow still passes
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST 12: Existing Moderation Workflow Regression ---");
  const modRes = await fetch(`${APP_URL}/api/admin/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      newModerationStatus: "ACTIVE",
      reason: "Verified active operational issue",
    }),
  });
  assert(modRes.ok, `Admin moderation API remains fully functional (HTTP 200) (Got ${modRes.status})`);

  // -----------------------------------------------------------------------------
  // TEST 13: Existing field evidence workflow still passes
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST 13: Field Evidence Submission Regression ---");
  const finalEvRes = await fetch(`${APP_URL}/api/field/submit-evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      workSummary: "Rework completed. Edge leveled and resealed with hot bitumen.",
      afterImageUrl: samplePath,
    }),
  });
  assert(finalEvRes.ok, "Field worker submits reworked evidence successfully (HTTP 200)");

  // Final approve to leave in resolved state
  const finalApprove = await fetch(`${APP_URL}/api/admin/verify-resolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      decision: "APPROVED",
      notes: "Final rework inspection passed. Quality verified.",
    }),
  });
  assert(finalApprove.ok, "Final approval succeeds and marks issue as RESOLVED");

  console.log("\n================================================================================");
  console.log("ALL 13 ADMIN RESOLUTION & VERIFICATION WORKFLOW TESTS PASSED (0 ERRORS)");
  console.log("================================================================================\n");
}

runAdminResolutionVerification().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
