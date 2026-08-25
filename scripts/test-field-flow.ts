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

async function testFieldFlow() {
  console.log("=== TESTING FIELD WORKER END-TO-END FLOW ===\n");
  
  // Use the test issue created in Phase 5C.1
  const testIssueId = "test-flow-1787125454364";
  
  // 1. Verify issue exists and is in SUBMITTED status
  console.log("--- Step 1: Verify initial issue state ---");
  const { data: initialIssue, error: initialErr } = await supabase
    .from("issues")
    .select("*")
    .eq("id", testIssueId)
    .single();
  
  if (initialErr) {
    console.log("❌ Initial issue fetch failed:", initialErr.message);
    return;
  }
  console.log("✅ Issue exists:", initialIssue.canonical_title);
  console.log("   Status:", initialIssue.status);
  console.log("   Department:", initialIssue.department_id || "Unassigned");
  
  // 2. Admin assigns the issue (simulating admin assignment)
  console.log("\n--- Step 2: Admin assigns issue ---");
  const timestamp = new Date().toISOString();
  const assignmentId = `asg-${Date.now()}`;
  
  const { error: assignIssueErr } = await supabase.from("issues").update({
    department_id: "dept-roads",
    status: "ASSIGNED",
    updated_at: timestamp,
  }).eq("id", testIssueId);
  
  if (assignIssueErr) {
    console.log("❌ Assignment (issue update) failed:", assignIssueErr.message);
    return;
  }
  console.log("✅ Issue updated to ASSIGNED with department");
  
  const { error: assignErr } = await supabase.from("assignments").insert({
    id: assignmentId,
    issue_id: testIssueId,
    department_id: "dept-roads",
    field_worker_id: "field-1",
    assigned_at: timestamp,
    target_resolution_date: new Date(Date.now() + 86400000 * 3).toISOString(),
  });
  
  if (assignErr) {
    console.log("❌ Assignment record failed:", assignErr.message);
    return;
  }
  console.log("✅ Assignment record created:", assignmentId);
  
  const { error: historyErr } = await supabase.from("status_history").insert({
    id: `sh-${Date.now()}`,
    issue_id: testIssueId,
    previous_status: "SUBMITTED",
    new_status: "ASSIGNED",
    changed_by: "admin-ops",
    comment: "Assigned to Roads & Infrastructure Department",
    timestamp,
  });
  
  if (historyErr) {
    console.log("❌ Status history failed:", historyErr.message);
    return;
  }
  console.log("✅ Status history recorded");
  
  // 3. Field worker retrieves assigned issues (simulating field worker dashboard)
  console.log("\n--- Step 3: Field worker retrieves assigned issues ---");
  const { data: allIssues, error: getAllErr } = await supabase
    .from("issues")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (getAllErr) {
    console.log("❌ getIssues failed:", getAllErr.message);
    return;
  }
  
  const assignedIssues = allIssues?.filter(i => 
    i.status === "ASSIGNED" || i.status === "IN_PROGRESS" || i.status === "VERIFICATION"
  ) || [];
  
  const foundAssigned = assignedIssues.find(i => i.id === testIssueId);
  if (foundAssigned) {
    console.log("✅ Field worker sees assigned issue:", foundAssigned.canonical_title);
    console.log("   Status:", foundAssigned.status);
    console.log("   Department:", foundAssigned.department_id);
  } else {
    console.log("❌ Field worker does NOT see assigned issue");
    return;
  }
  
  // 4. Field worker gets full issue detail
  console.log("\n--- Step 4: Field worker gets issue detail ---");
  const { data: issueDetail, error: detailErr } = await supabase
    .from("issues")
    .select("*")
    .eq("id", testIssueId)
    .single();
  
  if (detailErr) {
    console.log("❌ getIssue failed:", detailErr.message);
    return;
  }
  console.log("✅ getIssue works for field worker");
  
  // 5. Worker updates status to IN_PROGRESS
  console.log("\n--- Step 5: Worker updates status to IN_PROGRESS ---");
  const inProgressTimestamp = new Date().toISOString();
  
  const { error: inProgressErr } = await supabase.from("issues").update({
    status: "IN_PROGRESS",
    updated_at: inProgressTimestamp,
  }).eq("id", testIssueId);
  
  if (inProgressErr) {
    console.log("❌ Status update to IN_PROGRESS failed:", inProgressErr.message);
    return;
  }
  console.log("✅ Status updated to IN_PROGRESS");
  
  const { error: inProgressHistoryErr } = await supabase.from("status_history").insert({
    id: `sh-${Date.now()}`,
    issue_id: testIssueId,
    previous_status: "ASSIGNED",
    new_status: "IN_PROGRESS",
    changed_by: "field-worker-1",
    comment: "Field team arrived on site and commenced work.",
    timestamp: inProgressTimestamp,
  });
  
  if (inProgressHistoryErr) {
    console.log("❌ IN_PROGRESS history failed:", inProgressHistoryErr.message);
    return;
  }
  console.log("✅ IN_PROGRESS status history recorded");
  
  // 6. Worker submits evidence (simulating evidence submission)
  console.log("\n--- Step 6: Worker submits resolution evidence ---");
  const evidenceTimestamp = new Date().toISOString();
  const evidenceId = `ev-${Date.now()}`;
  
  // Use a test image URL (the app uses Unsplash URLs for demo)
  const beforeImageUrl = "https://images.unsplash.com/photo-1515162816999-a0c47dc192f8?auto=format&fit=crop&w=600&q=80";
  const afterImageUrl = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80";
  const workSummary = "Filled pothole with hot mix asphalt, compacted and sealed. Road surface restored to safe condition.";
  
  const { error: evidenceErr } = await supabase.from("resolution_evidence").insert({
    id: evidenceId,
    issue_id: testIssueId,
    field_worker_id: "field-worker-1",
    before_image_url: beforeImageUrl,
    after_image_url: afterImageUrl,
    work_summary: workSummary,
    submitted_at: evidenceTimestamp,
  });
  
  if (evidenceErr) {
    console.log("❌ Evidence submission failed:", evidenceErr.message);
    return;
  }
  console.log("✅ Resolution evidence created:", evidenceId);
  
  // 7. Update issue status to VERIFICATION
  console.log("\n--- Step 7: Update status to VERIFICATION ---");
  const { error: verificationStatusErr } = await supabase.from("issues").update({
    status: "VERIFICATION",
    updated_at: evidenceTimestamp,
  }).eq("id", testIssueId);
  
  if (verificationStatusErr) {
    console.log("❌ Status update to VERIFICATION failed:", verificationStatusErr.message);
    return;
  }
  console.log("✅ Status updated to VERIFICATION");
  
  const { error: verificationHistoryErr } = await supabase.from("status_history").insert({
    id: `sh-${Date.now()}`,
    issue_id: testIssueId,
    previous_status: "IN_PROGRESS",
    new_status: "VERIFICATION",
    changed_by: "field-worker-1",
    comment: "Resolution evidence submitted for AI & citizen verification.",
    timestamp: evidenceTimestamp,
  });
  
  if (verificationHistoryErr) {
    console.log("❌ VERIFICATION history failed:", verificationHistoryErr.message);
    return;
  }
  console.log("✅ VERIFICATION status history recorded");
  
  // 8. AI Verification (simulating verifyResolution)
  console.log("\n--- Step 8: AI Verification ---");
  const verificationTimestamp = new Date().toISOString();
  const verificationId = `ver-${Date.now()}`;
  
  const { error: verificationErr } = await supabase.from("verification_results").insert({
    id: verificationId,
    issue_id: testIssueId,
    ai_confidence_score: 0.95,
    ai_match_detected: true,
    ai_explanation: "AI visual verification confirms pothole filled and road surface restored.",
    verified_at: verificationTimestamp,
  });
  
  if (verificationErr) {
    console.log("❌ Verification result failed:", verificationErr.message);
    return;
  }
  console.log("✅ Verification result created:", verificationId);
  
  // 9. Update issue status to RESOLVED
  console.log("\n--- Step 9: Update status to RESOLVED ---");
  const { error: resolvedErr } = await supabase.from("issues").update({
    status: "RESOLVED",
    updated_at: verificationTimestamp,
  }).eq("id", testIssueId);
  
  if (resolvedErr) {
    console.log("❌ Status update to RESOLVED failed:", resolvedErr.message);
    return;
  }
  console.log("✅ Status updated to RESOLVED");
  
  const { error: resolvedHistoryErr } = await supabase.from("status_history").insert({
    id: `sh-${Date.now()}`,
    issue_id: testIssueId,
    previous_status: "VERIFICATION",
    new_status: "RESOLVED",
    changed_by: "ai-system",
    comment: "Verified and closed via AI visual verification.",
    timestamp: verificationTimestamp,
  });
  
  if (resolvedHistoryErr) {
    console.log("❌ RESOLVED history failed:", resolvedHistoryErr.message);
    return;
  }
  console.log("✅ RESOLVED status history recorded");
  
  // 10. Verify citizen-facing issue page shows resolution
  console.log("\n--- Step 10: Verify citizen-facing issue detail ---");
  const { data: finalIssue, error: finalErr } = await supabase
    .from("issues")
    .select("*")
    .eq("id", testIssueId)
    .single();
  
  if (finalErr) {
    console.log("❌ Final issue fetch failed:", finalErr.message);
    return;
  }
  console.log("✅ Final issue state:", finalIssue.status);
  
  // Check resolution evidence
  const { data: evidence, error: evidenceFetchErr } = await supabase
    .from("resolution_evidence")
    .select("*")
    .eq("issue_id", testIssueId)
    .single();
  
  if (evidenceFetchErr) {
    console.log("❌ Resolution evidence fetch failed:", evidenceFetchErr.message);
  } else {
    console.log("✅ Resolution evidence accessible:");
    console.log("   Work summary:", evidence.work_summary);
    console.log("   Before image:", evidence.before_image_url);
    console.log("   After image:", evidence.after_image_url);
  }
  
  // Check verification result
  const { data: verification, error: verificationFetchErr } = await supabase
    .from("verification_results")
    .select("*")
    .eq("issue_id", testIssueId)
    .single();
  
  if (verificationFetchErr) {
    console.log("❌ Verification result fetch failed:", verificationFetchErr.message);
  } else {
    console.log("✅ Verification result accessible:");
    console.log("   AI Confidence:", verification.ai_confidence_score);
    console.log("   Match detected:", verification.ai_match_detected);
    console.log("   Explanation:", verification.ai_explanation);
  }
  
  // Check status history
  const { data: history, error: historyFetchErr } = await supabase
    .from("status_history")
    .select("*")
    .eq("issue_id", testIssueId)
    .order("timestamp", { ascending: true });
  
  if (historyFetchErr) {
    console.log("❌ Status history fetch failed:", historyFetchErr.message);
  } else {
    console.log("✅ Status history accessible (", history?.length, "entries):");
    history?.forEach(h => {
      console.log(`   ${h.previous_status || "START"} → ${h.new_status} (by ${h.changed_by})`);
    });
  }
  
  console.log("\n=== FIELD WORKER END-TO-END FLOW TEST COMPLETE ===");
  console.log("Test Issue ID:", testIssueId);
}

testFieldFlow().catch(console.error);