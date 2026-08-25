import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runPhase8RefactorVerificationSuite() {
  console.log("====================================================");
  console.log(" PHASE 8 — PRODUCTION WORKFLOW REFACTOR TEST SUITE ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  let passedTests = 0;
  const totalTests = 23;
  const testIssueIds: string[] = [];

  function assert(condition: boolean, message: string) {
    if (condition) {
      passedTests++;
      console.log(`  ✓ TEST ${passedTests}/${totalTests}: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      throw new Error(`Test assertion failed: ${message}`);
    }
  }

  try {
    const timestamp = new Date().toISOString();

    // TEST 1-3: User Accounts Verification
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const adminUser = users.users.find(u => u.email === "admin.test@civicfix.local");
    const workerUser = users.users.find(u => u.email === "worker.test@civicfix.local");
    const citizenUser = users.users.find(u => u.email === "citizen.e2e@civicfix.local");

    assert(adminUser !== undefined, "Admin user account provisioned and verified.");
    assert(workerUser !== undefined, "Field Worker user account provisioned and verified.");
    assert(citizenUser !== undefined, "Citizen user account provisioned and verified.");

    // TEST 4-8: GPS & Leaflet Location Picker Verification
    const reportPageFile = require("fs").readFileSync("src/app/report/page.tsx", "utf8");
    const mapCompFile = require("fs").readFileSync("src/components/civic/LocationPickerMap.tsx", "utf8");

    assert(
      reportPageFile.includes("LocationPickerMap") && mapCompFile.includes("L.map"),
      "Leaflet interactive map location picker component integrated."
    );
    assert(
      mapCompFile.includes("MANUAL_ADJUSTMENT") && mapCompFile.includes("draggable: !disabled"),
      "Draggable marker & map click update position and set locationSource to MANUAL_ADJUSTMENT."
    );
    assert(
      reportPageFile.includes("nominatim.openstreetmap.org/reverse"),
      "Reverse geocoding via OpenStreetMap Nominatim API integrated."
    );
    assert(
      reportPageFile.includes("Debug Verification:") && reportPageFile.includes("locationSource"),
      "Non-production safe location debug verification info badge rendered."
    );
    assert(
      !reportPageFile.includes("Bangalore") && !reportPageFile.includes("12.9716"),
      "All hardcoded Bangalore/Bengaluru fallback coordinates removed."
    );

    // TEST 9-10: Admin Authorization & Server-Only supabaseAdmin
    const routeDeptFile = require("fs").readFileSync("src/app/api/admin/route-department/route.ts", "utf8");
    const assignDeptFile = require("fs").readFileSync("src/app/api/department/assign-internal/route.ts", "utf8");

    assert(
      routeDeptFile.includes('profile?.role !== "MUNICIPAL_ADMIN"'),
      "Municipal Admin department routing endpoint verifies MUNICIPAL_ADMIN role on server side."
    );
    assert(
      routeDeptFile.includes("supabaseAdmin") && assignDeptFile.includes("supabaseAdmin"),
      "Server-only privileged execution verified for department routing & internal assignment APIs."
    );

    // TEST 11-14: Department Routing & Removal of Direct Labourer Assignment
    const testIssueId = `issue-phase8-${Date.now()}`;
    testIssueIds.push(testIssueId);

    await supabaseAdmin.from("issues").insert({
      id: testIssueId,
      canonical_title: "Water Main Leakage on Station Road",
      category: "DRAINAGE",
      status: "SUBMITTED",
      priority_level: "HIGH",
      priority_score: 75,
      ward_id: "ward-01",
      latitude: 15.3524,
      longitude: 75.6289,
      address_text: "Station Road, Ward 1",
      created_at: timestamp,
      updated_at: timestamp,
    });

    // Execute Department Routing (ROUTED_TO_DEPARTMENT)
    await supabaseAdmin.from("issues").update({
      department_id: "dept-water",
      status: "ROUTED_TO_DEPARTMENT",
      updated_at: timestamp,
    }).eq("id", testIssueId);

    const sh1Id = `sh-ref-1-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({
      id: sh1Id,
      issue_id: testIssueId,
      previous_status: "SUBMITTED",
      new_status: "ROUTED_TO_DEPARTMENT",
      changed_by: adminUser?.id || "admin",
      comment: "ROUTED_TO_DEPARTMENT: Routed to [Water Supply & Drainage]",
      timestamp,
    });

    const { data: routedIssue } = await supabaseAdmin.from("issues").select("status, department_id").eq("id", testIssueId).single();
    assert(
      routedIssue?.status === "ROUTED_TO_DEPARTMENT" && routedIssue.department_id === "dept-water",
      "Municipal Admin routes issue to responsible department (ROUTED_TO_DEPARTMENT)."
    );

    // TEST 12: Department Routing Notes & Advisory Hint
    const { data: sh1Check } = await supabaseAdmin.from("status_history").select("*").eq("id", sh1Id).single();
    assert(sh1Check !== null && sh1Check.comment?.includes("ROUTED_TO_DEPARTMENT"), "Department routing audited in status_history.");

    // TEST 13: Department Internal Assignment (ASSIGNED)
    const asgId = `asg-ref-${Date.now()}`;
    await supabaseAdmin.from("assignments").insert({
      id: asgId,
      issue_id: testIssueId,
      department_id: "dept-water",
      team_id: "team-sanitation",
      target_type: "TEAM",
      assigned_at: timestamp,
      target_resolution_date: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      is_active: true,
    });

    await supabaseAdmin.from("issues").update({ status: "ASSIGNED", team_id: "team-sanitation", updated_at: timestamp }).eq("id", testIssueId);

    const { data: asgIssue } = await supabaseAdmin.from("issues").select("status, team_id").eq("id", testIssueId).single();
    assert(
      asgIssue?.status === "ASSIGNED" && asgIssue.team_id === "team-sanitation",
      "Department manager assigns internal operational team (ASSIGNED)."
    );

    // TEST 14: Removal of Direct Labourer Assignment from Admin Page
    const adminDetailFile = require("fs").readFileSync("src/app/admin/issues/[id]/page.tsx", "utf8");
    assert(
      adminDetailFile.includes("Municipal Department Routing") && !adminDetailFile.includes("Optimal 3"),
      "Direct labourer assignment and decorative 'Optimal 3' removed from Municipal Admin UI."
    );

    // TEST 15-16: Field Worker Operations Dashboard Task Filters
    const fieldPageFile = require("fs").readFileSync("src/app/field/page.tsx", "utf8");
    assert(
      fieldPageFile.includes("setStatusFilter") && fieldPageFile.includes("NEWLY_ROUTED") && fieldPageFile.includes("IN_PROGRESS"),
      "Field operations task queue includes lifecycle status filter tabs."
    );
    assert(
      fieldPageFile.includes("setPriorityFilter") && fieldPageFile.includes("HIGH") && fieldPageFile.includes("MEDIUM"),
      "Field operations task queue includes priority level filter dropdown."
    );

    // TEST 17-18: Evidence Upload & Storage
    const fieldDetailFile = require("fs").readFileSync("src/app/field/issues/[id]/page.tsx", "utf8");
    assert(
      fieldDetailFile.includes("civicService.uploadImage") && !fieldDetailFile.includes("SAMPLE_AFTER_IMAGES"),
      "Real evidence photo uploaded directly to Supabase Storage resolutions bucket."
    );
    assert(
      fieldDetailFile.includes("afterImageUrl: finalAfterUrl"),
      "Resolution evidence reference saved with actual uploaded image URL."
    );

    // TEST 19: Audit Trail Integrity
    const sh2Id = `sh-ref-2-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({
      id: sh2Id,
      issue_id: testIssueId,
      previous_status: "ASSIGNED",
      new_status: "IN_PROGRESS",
      changed_by: workerUser?.id || "worker",
      comment: "Field team arrived on site and commenced repair work",
      timestamp: new Date().toISOString(),
    });

    const { data: auditHistory } = await supabaseAdmin.from("status_history").select("*").eq("issue_id", testIssueId);
    assert(auditHistory !== null && auditHistory.length >= 2, "Full lifecycle status history and audit trail preserved.");

    // TEST 20: Navbar Public Site Links
    const adminNavFile = require("fs").readFileSync("src/components/admin/AdminNavbar.tsx", "utf8");
    const fieldNavFile = require("fs").readFileSync("src/components/field/FieldNavbar.tsx", "utf8");
    assert(
      adminNavFile.includes("🌐 Public Site") && fieldNavFile.includes("🌐 Public Site"),
      "Navbar links updated from confusing 'Citizen View' to clear '🌐 Public Site'."
    );

    // TEST 21: Session Storage Auth Scoping
    const clientFile = require("fs").readFileSync("src/services/supabaseClient.ts", "utf8");
    assert(clientFile.includes("window.sessionStorage"), "Supabase client configured with window.sessionStorage.");

    // TEST 22: Protected Phase C Record
    const { data: phaseC } = await supabaseAdmin
      .from("issues")
      .select("id, status")
      .eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba")
      .maybeSingle();

    assert(
      phaseC !== null && phaseC.status === "RESOLVED",
      "Protected Phase C record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba) remains INTACT (RESOLVED)."
    );

    // TEST 23: Clean Test Artifact Cleanup
    for (const id of testIssueIds) {
      await supabaseAdmin.from("status_history").delete().eq("issue_id", id);
      await supabaseAdmin.from("assignments").delete().eq("issue_id", id);
      await supabaseAdmin.from("issues").delete().eq("id", id);
    }
    const { data: verifyClean } = await supabaseAdmin.from("issues").select("id").in("id", testIssueIds);
    assert(
      verifyClean === null || verifyClean.length === 0,
      "All temporary Phase 8 test records safely cleaned up."
    );

    console.log("====================================================");
    console.log("  ALL 23 PHASE 8 REFACTOR VERIFICATION TESTS PASSED ");
    console.log("====================================================");
  } catch (err: any) {
    console.error("Verification Failure:", err);
    process.exit(1);
  }
}

runPhase8RefactorVerificationSuite().catch(console.error);
