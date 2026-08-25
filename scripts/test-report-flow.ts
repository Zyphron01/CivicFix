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

async function testReportFlow() {
  console.log("=== TESTING REPORT FLOW ===\n");
  
  // 1. Get initial issue count
  const { data: initialIssues, error: initialError } = await supabase
    .from("issues")
    .select("id");
  
  if (initialError) {
    console.log("❌ Initial fetch failed:", initialError.message);
    return;
  }
  
  console.log(`Initial issues in DB: ${initialIssues?.length || 0}`);
  
  // 2. Create a test report (simulating citizen submission)
  const testIssueId = `test-flow-${Date.now()}`;
  const testReportId = `test-report-${Date.now()}`;
  const timestamp = new Date().toISOString();
  
  console.log("\n--- Creating test report ---");
  
  const { error: issueErr } = await supabase.from("issues").insert({
    id: testIssueId,
    canonical_title: "Test Pothole on Main Street",
    category: "POTHOLE",
    status: "SUBMITTED",
    priority_level: "HIGH",
    priority_score: 85,
    ward_id: "ward-10",
    latitude: 12.9716,
    longitude: 77.5946,
    address_text: "MG Road near Junction 4, Central Ward",
    report_count: 1,
    created_at: timestamp,
    updated_at: timestamp,
  });
  
  if (issueErr) {
    console.log("❌ Issue insert failed:", issueErr.message);
    return;
  }
  console.log("✅ Issue created:", testIssueId);
  
  const { error: reportErr } = await supabase.from("reports").insert({
    id: testReportId,
    issue_id: testIssueId,
    citizen_id: "citizen-demo",
    description: "Large pothole causing vehicle damage near the intersection.",
    image_url: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f8?auto=format&fit=crop&w=600&q=80",
    latitude: 12.9716,
    longitude: 77.5946,
    ward_id: "ward-10",
    created_at: timestamp,
  });
  
  if (reportErr) {
    console.log("❌ Report insert failed:", reportErr.message);
    return;
  }
  console.log("✅ Report created:", testReportId);
  
  const { error: historyErr } = await supabase.from("status_history").insert({
    id: `test-sh-${Date.now()}`,
    issue_id: testIssueId,
    new_status: "SUBMITTED",
    changed_by: "citizen-demo",
    timestamp,
  });
  
  if (historyErr) {
    console.log("❌ History insert failed:", historyErr.message);
    return;
  }
  console.log("✅ Status history created");
  
  // 3. Verify the issue can be retrieved (simulating getIssue)
  console.log("\n--- Verifying getIssue ---");
  const { data: issueData, error: getIssueErr } = await supabase
    .from("issues")
    .select("*")
    .eq("id", testIssueId)
    .single();
  
  if (getIssueErr) {
    console.log("❌ getIssue failed:", getIssueErr.message);
    return;
  }
  console.log("✅ getIssue works:", issueData.canonical_title);
  
  // 4. Verify reports can be retrieved
  const { data: reportsData, error: getReportsErr } = await supabase
    .from("reports")
    .select("*")
    .eq("issue_id", testIssueId);
  
  if (getReportsErr) {
    console.log("❌ getReports failed:", getReportsErr.message);
    return;
  }
  console.log("✅ getReports works:", reportsData?.length, "report(s)");
  
  // 5. Verify getIssues (simulating admin dashboard)
  console.log("\n--- Verifying getIssues (admin dashboard) ---");
  const { data: allIssues, error: getAllErr } = await supabase
    .from("issues")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (getAllErr) {
    console.log("❌ getIssues failed:", getAllErr.message);
    return;
  }
  console.log("✅ getIssues works:", allIssues?.length, "total issue(s)");
  
  // Check if our test issue is in the list
  const found = allIssues?.find(i => i.id === testIssueId);
  if (found) {
    console.log("✅ Test issue appears in admin list");
  } else {
    console.log("❌ Test issue NOT in admin list");
  }
  
  // 6. Verify refresh persistence (just query again)
  console.log("\n--- Verifying refresh persistence ---");
  const { data: refreshCheck, error: refreshErr } = await supabase
    .from("issues")
    .select("*")
    .eq("id", testIssueId)
    .single();
  
  if (refreshErr) {
    console.log("❌ Refresh check failed:", refreshErr.message);
    return;
  }
  console.log("✅ Refresh persistence works - issue still exists");
  
  console.log("\n=== REPORT FLOW TEST COMPLETE ===");
  console.log("Test Issue ID:", testIssueId);
  console.log("Test Report ID:", testReportId);
}

testReportFlow().catch(console.error);