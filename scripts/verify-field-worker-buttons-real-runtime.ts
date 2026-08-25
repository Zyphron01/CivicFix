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

async function runFieldButtonVerification() {
  console.log("================================================================================");
  console.log("CIVICFIX: FIELD WORKER ACTION BUTTONS REAL RUNTIME VERIFICATION");
  console.log("================================================================================\n");

  // Sign in as Municipal Admin
  const { data: adminAuth, error: adminAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "admin.test@civicfix.local",
    password: "AdminPassword123!",
  });
  assert(!adminAuthErr && !!adminAuth.session, "Admin sign-in successful");
  const adminToken = adminAuth.session!.access_token;

  // Sign in as Authorized Field Worker (member of team-roads)
  const { data: workerAuth, error: workerAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "worker.test@civicfix.local",
    password: "WorkerPassword123!",
  });
  assert(!workerAuthErr && !!workerAuth.session, "Authorized field worker sign-in successful");
  const workerToken = workerAuth.session!.access_token;
  const workerId = workerAuth.user!.id;

  // Sign in as Unauthorized Field Worker (NOT member of team-roads)
  const { data: unauthAuth, error: unauthAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "worker.demo2@civicfix.local",
    password: "WorkerPassword123!",
  });
  assert(!unauthAuthErr && !!unauthAuth.session, "Unauthorized worker sign-in successful");
  const unauthToken = unauthAuth.session!.access_token;

  // Setup target test issue assigned to team-roads
  const targetIssueId = "issue-e2b67742-34a7-4f99-9f87-52978cdab179";

  // Ensure issue is assigned to team-roads
  await fetch(`${APP_URL}/api/department/assign-internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      targetType: "TEAM",
      teamId: "team-roads",
      assignmentNotes: "Field button test assignment",
    }),
  });

  // Reset status to ASSIGNED for clean test
  await supabaseAdmin.from("issues").update({ status: "ASSIGNED" }).eq("id", targetIssueId);

  // -----------------------------------------------------------------------------
  // TEST A: BUTTON 1 — MARK TASK AS IN PROGRESS
  // -----------------------------------------------------------------------------
  console.log("--- TEST A: Button 1 — Mark Task as In Progress ---");

  const startRes = await fetch(`${APP_URL}/api/field/update-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerToken}`,
    },
    body: JSON.stringify({
      issueId: targetIssueId,
      status: "IN_PROGRESS",
      comment: "Field team arrived on site and commenced work.",
    }),
  });

  assert(startRes.ok, `POST /api/field/update-status returns HTTP 200 (Got ${startRes.status})`);
  const startJson = await startRes.json();
  assert(startJson.success === true, "update-status response indicates success");
  assert(startJson.status === "IN_PROGRESS", "update-status response confirms IN_PROGRESS");

  // Verify real database row
  const { data: issueDbAfterStart } = await supabaseAdmin
    .from("issues")
    .select("status")
    .eq("id", targetIssueId)
    .single();

  assert(issueDbAfterStart?.status === "IN_PROGRESS", "Real database issues.status is IN_PROGRESS");

  // Verify status_history in database
  const { data: historyEntries } = await supabaseAdmin
    .from("status_history")
    .select("*")
    .eq("issue_id", targetIssueId)
    .order("timestamp", { ascending: false });

  const latestHistory = historyEntries?.[0];
  assert(latestHistory?.new_status === "IN_PROGRESS", "status_history record created with new_status = IN_PROGRESS");
  assert(latestHistory?.changed_by === workerId, "status_history record changed_by matches Field Worker ID");

  // Verify Admin workspace reflects IN_PROGRESS
  const adminCheck = await (await fetch(`${APP_URL}/api/admin/issues/${targetIssueId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).json();
  assert(adminCheck.issue?.status === "IN_PROGRESS", "Admin workspace immediately reflects status IN_PROGRESS");

  // Test idempotency: calling again should succeed without duplicate status_history
  const historyCountBefore = historyEntries?.length || 0;
  const startRes2 = await fetch(`${APP_URL}/api/field/update-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}` },
    body: JSON.stringify({ issueId: targetIssueId, status: "IN_PROGRESS" }),
  });
  assert(startRes2.ok, "Idempotent second call returns HTTP 200");
  const { data: historyEntriesAfter } = await supabaseAdmin
    .from("status_history")
    .select("id")
    .eq("issue_id", targetIssueId);
  assert(historyEntriesAfter?.length === historyCountBefore, "Duplicate status history entry prevented on idempotent call");

  // -----------------------------------------------------------------------------
  // TEST B: BUTTON 2 — SUBMIT RESOLUTION EVIDENCE FOR AI VISUAL VERIFICATION
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST B: Button 2 — Submit Resolution Evidence ---");

  // 1. Upload sample evidence image directly to storage
  const sampleImagePath = `resolutions/${workerId}/${Date.now()}_test_after.jpg`;
  const dummyBuffer = Buffer.from("fake-jpg-image-binary-evidence-data-for-civicfix");
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("civicfix-evidence")
    .upload(sampleImagePath, dummyBuffer, { contentType: "image/jpeg", upsert: true });

  assert(!uploadErr, "Evidence image uploaded to canonical civicfix-evidence bucket");

  // 2. Submit resolution evidence via API
  const testWorkSummary = "Asphalt patched with 50mm bitumen layer, compacted with vibratory roller.";
  const submitRes = await fetch(`${APP_URL}/api/field/submit-evidence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerToken}`,
    },
    body: JSON.stringify({
      issueId: targetIssueId,
      workSummary: testWorkSummary,
      afterImageUrl: sampleImagePath,
      beforeImageUrl: "reports/sample_before.jpg",
    }),
  });

  assert(submitRes.ok, `POST /api/field/submit-evidence returns HTTP 200 (Got ${submitRes.status})`);
  const submitJson = await submitRes.json();
  assert(submitJson.success === true, "submit-evidence response indicates success");
  assert(submitJson.evidence?.workSummary === testWorkSummary, "Evidence response contains submitted workSummary");

  // 3. Verify real database writes:
  // (a) resolution_evidence
  const { data: evRows } = await supabaseAdmin
    .from("resolution_evidence")
    .select("*")
    .eq("issue_id", targetIssueId)
    .order("submitted_at", { ascending: false });

  const evDb = evRows?.[0];

  assert(evDb?.work_summary === testWorkSummary, "resolution_evidence row created in DB with correct work_summary");
  assert(evDb?.after_image_url === sampleImagePath, "resolution_evidence row stores canonical storage path");
  assert(evDb?.field_worker_id === workerId, "resolution_evidence row stores worker ID");

  // (b) issues.status -> VERIFICATION
  const { data: issueDbAfterEv } = await supabaseAdmin
    .from("issues")
    .select("status")
    .eq("id", targetIssueId)
    .single();

  assert(issueDbAfterEv?.status === "VERIFICATION", "issues.status updated to VERIFICATION in real DB");

  // (c) status_history
  const { data: evHistory } = await supabaseAdmin
    .from("status_history")
    .select("*")
    .eq("issue_id", targetIssueId)
    .order("timestamp", { ascending: false });

  assert(evHistory?.[0]?.new_status === "VERIFICATION", "status_history record created for VERIFICATION");

  // (d) verification_results
  const { data: verRows } = await supabaseAdmin
    .from("verification_results")
    .select("*")
    .eq("issue_id", targetIssueId)
    .order("verified_at", { ascending: false });

  const verDb = verRows?.[0];
  assert(verDb?.ai_match_detected === true, "verification_results record created in DB");

  // (e) Admin workspace reflects verification evidence
  const adminDetail = await (await fetch(`${APP_URL}/api/admin/issues/${targetIssueId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).json();

  assert(adminDetail.issue?.status === "VERIFICATION", "Admin workspace shows issue status VERIFICATION");
  assert(adminDetail.issue?.resolutionEvidence?.workSummary === testWorkSummary, "Admin workspace displays resolution evidence workSummary");

  // -----------------------------------------------------------------------------
  // TEST C: SECURITY ENFORCEMENT (TEST C)
  // -----------------------------------------------------------------------------
  console.log("\n--- TEST C: Security & Authorization Enforcement ---");

  // 1. Unauthorized worker attempts update-status
  const unauthStart = await fetch(`${APP_URL}/api/field/update-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${unauthToken}` },
    body: JSON.stringify({ issueId: targetIssueId, status: "IN_PROGRESS" }),
  });
  assert(unauthStart.status === 403, `Unauthorized worker update-status blocked with HTTP 403 (Got ${unauthStart.status})`);

  // 2. Unauthorized worker attempts submit-evidence
  const unauthEv = await fetch(`${APP_URL}/api/field/submit-evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${unauthToken}` },
    body: JSON.stringify({
      issueId: targetIssueId,
      workSummary: "Hacked work summary",
      afterImageUrl: sampleImagePath,
    }),
  });
  assert(unauthEv.status === 403, `Unauthorized worker submit-evidence blocked with HTTP 403 (Got ${unauthEv.status})`);

  // 3. Unauthenticated request (no token)
  const noAuth = await fetch(`${APP_URL}/api/field/update-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueId: targetIssueId, status: "IN_PROGRESS" }),
  });
  assert(noAuth.status === 401, `Unauthenticated request blocked with HTTP 401 (Got ${noAuth.status})`);

  console.log("\n================================================================================");
  console.log("ALL FIELD WORKER BUTTON VERIFICATION TESTS (A, B, C) PASSED WITH ZERO ERRORS");
  console.log("================================================================================\n");
}

runFieldButtonVerification().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
