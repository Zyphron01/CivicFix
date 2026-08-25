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

async function testConnection() {
  console.log("Testing Supabase connection...");
  
  // Test 1: Check tables exist
  const tables = [
    "issues",
    "reports", 
    "assignments",
    "status_history",
    "resolution_evidence",
    "verification_results",
    "ai_triage_assessments"
  ];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(1);
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: EXISTS (${data?.length || 0} rows)`);
      }
    } catch (e) {
      console.log(`❌ ${table}: ${e}`);
    }
  }
  
  // Test 2: Check storage bucket
  try {
    const { data: files, error } = await supabase.storage
      .from("civic-evidence")
      .list("", { limit: 1 });
      
    if (error) {
      console.log(`❌ civic-evidence bucket: NOT ACCESSIBLE (${error.message})`);
    } else {
      console.log(`✅ civic-evidence bucket: ACCESSIBLE`);
    }
  } catch (e) {
    console.log(`❌ civic-evidence bucket check failed: ${e}`);
  }
  
  // Test 3: Test getIssues
  try {
    const { data, error } = await supabase.from("issues").select("*").limit(5);
    if (error) {
      console.log(`❌ getIssues: ${error.message}`);
    } else {
      console.log(`✅ getIssues: ${data?.length || 0} issues found`);
    }
  } catch (e) {
    console.log(`❌ getIssues failed: ${e}`);
  }
  
  // Test 4: Test createReport (insert test issue)
  try {
    const testIssueId = `test-issue-${Date.now()}`;
    const testReportId = `test-report-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    const { error: issueErr } = await supabase.from("issues").insert({
      id: testIssueId,
      canonical_title: "Test Issue - Verification",
      category: "POTHOLE",
      status: "SUBMITTED",
      priority_level: "MEDIUM",
      priority_score: 50,
      ward_id: "ward-test",
      latitude: 12.9716,
      longitude: 77.5946,
      address_text: "Test Location",
      report_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    
    if (issueErr) {
      console.log(`❌ createReport (issue): ${issueErr.message}`);
    } else {
      console.log(`✅ createReport (issue): INSERTED ${testIssueId}`);
      
      const { error: reportErr } = await supabase.from("reports").insert({
        id: testReportId,
        issue_id: testIssueId,
        citizen_id: "test-citizen",
        description: "Test report for verification",
        image_url: null,
        latitude: 12.9716,
        longitude: 77.5946,
        ward_id: "ward-test",
        created_at: timestamp,
      });
      
      if (reportErr) {
        console.log(`❌ createReport (report): ${reportErr.message}`);
      } else {
        console.log(`✅ createReport (report): INSERTED ${testReportId}`);
      }
      
      const { error: historyErr } = await supabase.from("status_history").insert({
        id: `test-sh-${Date.now()}`,
        issue_id: testIssueId,
        new_status: "SUBMITTED",
        changed_by: "test-citizen",
        timestamp,
      });
      
      if (historyErr) {
        console.log(`❌ createReport (history): ${historyErr.message}`);
      } else {
        console.log(`✅ createReport (history): INSERTED`);
      }
    }
  } catch (e) {
    console.log(`❌ createReport failed: ${e}`);
  }
  
  // Test 5: Test getIssue
  try {
    const { data, error } = await supabase.from("issues").select("*").eq("id", "issue-1").maybeSingle();
    if (error) {
      console.log(`❌ getIssue: ${error.message}`);
    } else if (data) {
      console.log(`✅ getIssue: Found ${data.canonical_title}`);
    } else {
      console.log(`⚠️ getIssue: issue-1 not found (expected if using mock data)`);
    }
  } catch (e) {
    console.log(`❌ getIssue failed: ${e}`);
  }
  
  // Test 6: Test updateIssueStatus
  try {
    const testIssueId = `test-issue-${Date.now() - 1000}`; // Use a different ID
    const timestamp = new Date().toISOString();
    
    // First create a test issue
    await supabase.from("issues").insert({
      id: testIssueId,
      canonical_title: "Test Update Status",
      category: "GARBAGE",
      status: "SUBMITTED",
      priority_level: "LOW",
      priority_score: 30,
      ward_id: "ward-test",
      latitude: 12.9352,
      longitude: 77.6245,
      address_text: "Test Location",
      report_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    
    const { error } = await supabase.from("issues").update({
      status: "ASSIGNED",
      updated_at: timestamp,
    }).eq("id", testIssueId);
    
    if (error) {
      console.log(`❌ updateIssueStatus: ${error.message}`);
    } else {
      console.log(`✅ updateIssueStatus: UPDATED ${testIssueId}`);
    }
  } catch (e) {
    console.log(`❌ updateIssueStatus failed: ${e}`);
  }
  
  // Test 7: Test assignIssue
  try {
    const testIssueId = `test-assign-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    await supabase.from("issues").insert({
      id: testIssueId,
      canonical_title: "Test Assignment",
      category: "DRAINAGE",
      status: "SUBMITTED",
      priority_level: "HIGH",
      priority_score: 80,
      ward_id: "ward-test",
      latitude: 12.9901,
      longitude: 77.5512,
      address_text: "Test Location",
      report_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    
    const { error: issueErr } = await supabase.from("issues").update({
      department_id: "dept-sanitation",
      status: "ASSIGNED",
      updated_at: timestamp,
    }).eq("id", testIssueId);
    
    if (issueErr) {
      console.log(`❌ assignIssue (issue): ${issueErr.message}`);
    } else {
      const { error: assignErr } = await supabase.from("assignments").insert({
        id: `test-asg-${Date.now()}`,
        issue_id: testIssueId,
        department_id: "dept-sanitation",
        field_worker_id: "field-test",
        assigned_at: timestamp,
        target_resolution_date: new Date(Date.now() + 86400000 * 3).toISOString(),
      });
      
      if (assignErr) {
        console.log(`❌ assignIssue (assignment): ${assignErr.message}`);
      } else {
        console.log(`✅ assignIssue: COMPLETE`);
      }
    }
  } catch (e) {
    console.log(`❌ assignIssue failed: ${e}`);
  }
  
  // Test 8: Test submitEvidence
  try {
    const testIssueId = `test-evidence-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    await supabase.from("issues").insert({
      id: testIssueId,
      canonical_title: "Test Evidence",
      category: "STREETLIGHT",
      status: "IN_PROGRESS",
      priority_level: "LOW",
      priority_score: 20,
      ward_id: "ward-test",
      latitude: 12.9654,
      longitude: 77.5812,
      address_text: "Test Location",
      report_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    
    const { error } = await supabase.from("resolution_evidence").insert({
      id: `test-ev-${Date.now()}`,
      issue_id: testIssueId,
      field_worker_id: "field-test",
      before_image_url: "https://example.com/before.jpg",
      after_image_url: "https://example.com/after.jpg",
      work_summary: "Test work summary",
      submitted_at: timestamp,
    });
    
    if (error) {
      console.log(`❌ submitEvidence: ${error.message}`);
    } else {
      console.log(`✅ submitEvidence: INSERTED`);
    }
  } catch (e) {
    console.log(`❌ submitEvidence failed: ${e}`);
  }
  
  // Test 9: Test verifyResolution
  try {
    const testIssueId = `test-verify-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    await supabase.from("issues").insert({
      id: testIssueId,
      canonical_title: "Test Verification",
      category: "WATER_LEAKAGE",
      status: "VERIFICATION",
      priority_level: "HIGH",
      priority_score: 85,
      ward_id: "ward-test",
      latitude: 12.9750,
      longitude: 77.6050,
      address_text: "Test Location",
      report_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    
    const { error } = await supabase.from("verification_results").insert({
      id: `test-ver-${Date.now()}`,
      issue_id: testIssueId,
      ai_confidence_score: 0.95,
      ai_match_detected: true,
      ai_explanation: "Test verification",
      verified_at: timestamp,
    });
    
    if (error) {
      console.log(`❌ verifyResolution: ${error.message}`);
    } else {
      console.log(`✅ verifyResolution: INSERTED`);
    }
  } catch (e) {
    console.log(`❌ verifyResolution failed: ${e}`);
  }
  
  // Test 10: Test getDashboardStats
  try {
    const { data, error } = await supabase.from("issues").select("status, priority_level");
    if (error) {
      console.log(`❌ getDashboardStats: ${error.message}`);
    } else {
      const totalIssues = data?.length || 0;
      const resolvedIssues = data?.filter(i => i.status === "RESOLVED").length || 0;
      const pendingVerification = data?.filter(i => i.status === "VERIFICATION").length || 0;
      const criticalIssues = data?.filter(i => i.priority_level === "CRITICAL").length || 0;
      console.log(`✅ getDashboardStats: total=${totalIssues}, resolved=${resolvedIssues}, pending=${pendingVerification}, critical=${criticalIssues}`);
    }
  } catch (e) {
    console.log(`❌ getDashboardStats failed: ${e}`);
  }
  
  // Test 11: End-to-end integration and AI triage flow verification via SupabaseCivicService
  console.log("\nTesting End-to-End Service Integration & AI Triage Flow...");
  try {
    const { SupabaseCivicService } = await import("../src/services/supabaseCivicService");
    const service = new SupabaseCivicService();
    
    // 1. Core createReport() test
    const timestamp = Date.now();
    const testReportInput = {
      title: `Dangerous Pothole on Bypass Road - ${timestamp}`,
      description: "A major, deep pothole has opened up near the highway exit. Cars are swerving to avoid it. This is dangerous.",
      category: "POTHOLE" as const,
      latitude: 12.9123,
      longitude: 77.6456,
      addressText: "Outer Ring Road Bypass, Ward 14",
      wardId: "ward-14",
      citizenId: "citizen-test-e2e",
    };
    
    console.log("Calling createReport()...");
    const issue = await service.createReport(testReportInput);
    
    if (issue) {
      console.log(`✅ createReport: SUCCESS (Issue ID: ${issue.id})`);
      console.log(`   Canonical Title: "${issue.canonicalTitle}"`);
      console.log(`   Triage Priority Level: ${issue.priorityLevel} (Score: ${issue.priorityScore})`);
      
      const assessment = issue.aiAssessment;
      if (assessment) {
        console.log(`✅ ai_triage_assessments entry: EXISTS`);
        console.log(`   Provider: ${assessment.provider}`);
        console.log(`   Model: ${assessment.model}`);
        console.log(`   Fallback Heuristic Used: ${assessment.provider === "local-heuristic" ? "Yes" : "No"}`);
        console.log(`   Recommended Department: "${assessment.recommendedDepartment}"`);
        console.log(`   Reasoning: "${assessment.reasoning}"`);
        console.log(`   Work Summary: "${assessment.workSummary}"`);
        
        // 2. Core getIssue() check
        const retrieved = await service.getIssue(issue.id);
        if (retrieved && retrieved.aiAssessment && retrieved.aiAssessment.priorityLevel === issue.priorityLevel) {
          console.log(`✅ getIssue(): SUCCESS (Retrieved matching assessment JSON)`);
        } else {
          console.log(`❌ getIssue(): FAILED to retrieve correct assessment`);
        }
        
        // 3. Core getIssues() check
        const allIssues = await service.getIssues();
        const found = allIssues.find(i => i.id === issue.id);
        if (found) {
          console.log(`✅ getIssues(): SUCCESS (Newly created issue found in list)`);
        } else {
          console.log(`❌ getIssues(): FAILED to find newly created issue in list`);
        }
        
        // 4. Core updateIssueStatus() check
        const updated = await service.updateIssueStatus(issue.id, "IN_PROGRESS", "field-worker-test", "Commencing bypass repair.");
        if (updated && updated.status === "IN_PROGRESS") {
          console.log(`✅ updateIssueStatus(): SUCCESS (Status changed to IN_PROGRESS)`);
        } else {
          console.log(`❌ updateIssueStatus(): FAILED to update status`);
        }
      } else {
        console.log(`❌ ai_triage_assessments entry: NOT FOUND in returned issue`);
      }
    } else {
      console.log(`❌ createReport: FAILED to return issue`);
    }
  } catch (e) {
    console.log(`❌ End-to-End Service Integration Test failed: ${e}`);
  }
  
  console.log("\nVerification complete.");
}

testConnection().catch(console.error);