import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const APP_URL = "http://localhost:3000";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition: boolean, msg: string, detail?: any) {
  if (!condition) {
    console.error(`  [FAIL] ${msg}`, detail !== undefined ? detail : "");
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
}

async function verifyModerationQueues() {
  console.log("================================================================================");
  console.log("CIVICFIX: MODERATION WORKFLOW & QUEUE ISOLATION END-TO-END VERIFICATION");
  console.log("================================================================================\n");

  // Sign in as Municipal Admin
  const { data: adminAuth, error: adminAuthErr } = await supabaseClient.auth.signInWithPassword({
    email: "admin.test@civicfix.local",
    password: "AdminPassword123!",
  });
  assert(!adminAuthErr && !!adminAuth.session, "Admin login successful");
  const token = adminAuth.session!.access_token;

  // 1. Verify GET /api/admin/issues returns all issues with normalized moderationStatus
  const allRes = await fetch(`${APP_URL}/api/admin/issues`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(allRes.ok, "GET /api/admin/issues returns HTTP 200");
  const allJson = await allRes.json();
  assert(allJson.success === true && Array.isArray(allJson.issues), "Returned valid issues list");

  const testArchivedId = "issue-f994e2c4-d9ec-45f0-9fe0-fcc1c1c96efb";
  const archivedIssue = allJson.issues.find((i: any) => i.id === testArchivedId);
  assert(!!archivedIssue, `User test issue ${testArchivedId} is present in admin issues collection`);
  assert(archivedIssue.moderationStatus === "ARCHIVED", `User test issue moderationStatus is ARCHIVED (Got: ${archivedIssue.moderationStatus})`);

  // 2. Verify Issue Detail GET /api/admin/issues/[id] for the archived issue
  const detailRes = await fetch(`${APP_URL}/api/admin/issues/${testArchivedId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(detailRes.ok, "GET /api/admin/issues/[id] returns HTTP 200 for archived issue");
  const detailJson = await detailRes.json();
  assert(detailJson.issue?.moderationStatus === "ARCHIVED", "Archived issue detail returns moderationStatus = ARCHIVED");

  // 3. Test Phase 6: Verify all 4 moderation states dynamically
  console.log("\n--- Testing Moderation State Transitions on Sample Issues ---");

  // Test Under Review transition
  const sampleIssueId = "issue-e2b67742-34a7-4f99-9f87-52978cdab179";
  const reviewRes = await fetch(`${APP_URL}/api/admin/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ issueId: sampleIssueId, newModerationStatus: "UNDER_REVIEW" }),
  });
  assert(reviewRes.ok, "POST /api/admin/moderate -> UNDER_REVIEW returns HTTP 200");

  const sampleDetailReview = await (await fetch(`${APP_URL}/api/admin/issues/${sampleIssueId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert(sampleDetailReview.issue?.moderationStatus === "UNDER_REVIEW", "Issue correctly transitions to UNDER_REVIEW");

  // Test Suspicious transition
  const suspRes = await fetch(`${APP_URL}/api/admin/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ issueId: sampleIssueId, newModerationStatus: "SUSPICIOUS" }),
  });
  assert(suspRes.ok, "POST /api/admin/moderate -> SUSPICIOUS returns HTTP 200");

  const sampleDetailSusp = await (await fetch(`${APP_URL}/api/admin/issues/${sampleIssueId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert(sampleDetailSusp.issue?.moderationStatus === "SUSPICIOUS", "Issue correctly transitions to SUSPICIOUS");

  // Test Rejected transition
  const rejRes = await fetch(`${APP_URL}/api/admin/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ issueId: sampleIssueId, newModerationStatus: "REJECTED", reason: "Duplicate road hazard report" }),
  });
  assert(rejRes.ok, "POST /api/admin/moderate -> REJECTED returns HTTP 200");

  const sampleDetailRej = await (await fetch(`${APP_URL}/api/admin/issues/${sampleIssueId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert(sampleDetailRej.issue?.moderationStatus === "REJECTED", "Issue correctly transitions to REJECTED");
  assert(sampleDetailRej.issue?.moderationReason === "Duplicate road hazard report", "Issue preserves rejection reason");

  // Restore back to ACTIVE for operational workflows
  const activeRes = await fetch(`${APP_URL}/api/admin/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ issueId: sampleIssueId, newModerationStatus: "ACTIVE" }),
  });
  assert(activeRes.ok, "POST /api/admin/moderate -> ACTIVE returns HTTP 200");

  // 4. Verify Final Queue Counts from GET /api/admin/issues
  const refreshedList = await (await fetch(`${APP_URL}/api/admin/issues`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const archivedRecords = refreshedList.issues.filter((i: any) => i.moderationStatus === "ARCHIVED");
  assert(archivedRecords.length >= 1, `Archived Records queue contains at least 1 archived issue (Found ${archivedRecords.length})`);
  assert(archivedRecords.some((i: any) => i.id === testArchivedId), `Exact user test issue ${testArchivedId} is present in Archived Records`);

  console.log("\n================================================================================");
  console.log("ALL MODERATION WORKFLOW & QUEUE ISOLATION TESTS PASSED (0 ERRORS)");
  console.log("================================================================================\n");
}

verifyModerationQueues().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
