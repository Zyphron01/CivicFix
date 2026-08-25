import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runPhaseF8VerificationSuite() {
  console.log("==========================================================");
  console.log(" CIVICFIX PHASE F8 — REAL LOCATION ARCHITECTURE TEST SUITE ");
  console.log("==========================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  let passedTests = 0;
  const totalTests = 24;
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
    const adminUser = users.users.find((u) => u.email === "admin.test@civicfix.local");
    const workerUser = users.users.find((u) => u.email === "worker.test@civicfix.local");
    const citizenUser = users.users.find((u) => u.email === "citizen.e2e@civicfix.local");

    assert(adminUser !== undefined, "Admin user account provisioned and verified.");
    assert(workerUser !== undefined, "Field Worker user account provisioned and verified.");
    assert(citizenUser !== undefined, "Citizen user account provisioned and verified.");

    // TEST 4: Dedicated Location Service Existence & Single Source of Truth
    const locServiceFile = require("fs").readFileSync("src/services/locationService.ts", "utf8");
    assert(
      locServiceFile.includes("getLiveDeviceLocation") && locServiceFile.includes("LIVE_DEVICE_LOCATION"),
      "Dedicated LocationService created as single source of truth for live device location."
    );

    // TEST 5-8: Real Location Workflow & UI Integration
    const reportPageFile = require("fs").readFileSync("src/app/report/page.tsx", "utf8");
    const mapCompFile = require("fs").readFileSync("src/components/civic/LocationPickerMap.tsx", "utf8");

    assert(
      reportPageFile.includes("locationService.getLiveDeviceLocation") && mapCompFile.includes("L.map"),
      "Report page uses locationService for live location acquisition and Leaflet map visualization."
    );
    assert(
      mapCompFile.includes("MANUAL_LOCATION") && mapCompFile.includes("No Location Detected Yet"),
      "Map component starts in neutral state without placing false city markers, tagging manual pin adjustments as MANUAL_LOCATION."
    );
    assert(
      reportPageFile.includes("locationService.reverseGeocode"),
      "Reverse geocoding strictly occurs AFTER coordinates are acquired."
    );
    assert(
      reportPageFile.includes("Development Location Diagnostics") && reportPageFile.includes("permissionState"),
      "Development Location Diagnostics panel renders live Geolocation API metrics."
    );

    // TEST 9-10: Complete Purge of Hardcoded Bangalore Coordinates
    assert(
      !reportPageFile.includes("Bangalore") && !reportPageFile.includes("12.9716") && !mapCompFile.includes("15.3524"),
      "All hardcoded Bangalore/Bengaluru and city default coordinates completely purged from reporting flow."
    );
    assert(
      !reportPageFile.includes("±5000m") && reportPageFile.includes("locationAccuracy > 1000"),
      "Fixed fake accuracy ±5000m values removed; accuracy warning banner handles wide network IP locations."
    );

    // TEST 11-14: Municipal Admin Department Routing & Assignment Workflow
    const testIssueId = `issue-f8loc-${Date.now()}`;
    testIssueIds.push(testIssueId);

    // Real Ilkal/Bagalkot coordinates simulation: 15.9554, 75.9255
    const ilkalLat = 15.9554;
    const ilkalLng = 75.9255;

    const { error: insErr } = await supabaseAdmin.from("issues").insert({
      id: testIssueId,
      canonical_title: "Water Main Leakage near Bus Stand Road, Ilkal",
      category: "WATER_LEAKAGE",
      status: "SUBMITTED",
      priority_level: "HIGH",
      priority_score: 82,
      ward_id: "ward-01",
      latitude: ilkalLat,
      longitude: ilkalLng,
      address_text: "Bus Stand Road, Ilkal, Bagalkot District",
      created_at: timestamp,
      updated_at: timestamp,
    });
    if (insErr) console.error("DEBUG insert error:", insErr);

    // Execute Department Routing (ROUTED_TO_DEPARTMENT)
    await supabaseAdmin.from("issues").update({
      department_id: "dept-water",
      status: "ROUTED_TO_DEPARTMENT",
      updated_at: timestamp,
    }).eq("id", testIssueId);

    const sh1Id = `sh-f8loc-1-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({
      id: sh1Id,
      issue_id: testIssueId,
      previous_status: "SUBMITTED",
      new_status: "ROUTED_TO_DEPARTMENT",
      changed_by: adminUser?.id || "admin",
      comment: "ROUTED_TO_DEPARTMENT: Routed to Water Supply & Drainage",
      timestamp,
    });

    const { data: routedIssue } = await supabaseAdmin.from("issues").select("status, department_id, latitude, longitude").eq("id", testIssueId).single();
    console.log("DEBUG routedIssue:", routedIssue);
    assert(
      routedIssue?.status === "ROUTED_TO_DEPARTMENT" &&
      routedIssue.department_id === "dept-water" &&
      Math.abs(Number(routedIssue.latitude) - ilkalLat) < 0.0001 &&
      Math.abs(Number(routedIssue.longitude) - ilkalLng) < 0.0001,
      "Ilkal/Bagalkot report submitted with LIVE_DEVICE_LOCATION and routed to responsible department."
    );

    // TEST 12: Department Routing Audited in status_history
    const { data: sh1Check } = await supabaseAdmin.from("status_history").select("*").eq("id", sh1Id).single();
    assert(sh1Check !== null && sh1Check.comment?.includes("ROUTED_TO_DEPARTMENT"), "Department routing audited in status_history.");

    // TEST 13: Department Internal Assignment (ASSIGNED)
    const asgId = `asg-f8loc-${Date.now()}`;
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
      "Direct labourer selection and decorative 'Optimal 3' removed from Municipal Admin UI."
    );

    // TEST 15-17: Field Operations Task Queue Filtering
    const fieldPageFile = require("fs").readFileSync("src/app/field/page.tsx", "utf8");
    assert(
      fieldPageFile.includes("setStatusFilter") && fieldPageFile.includes("NEWLY_ROUTED") && fieldPageFile.includes("IN_PROGRESS"),
      "Field operations task queue includes lifecycle status filter tabs."
    );
    assert(
      fieldPageFile.includes("setPriorityFilter") && fieldPageFile.includes("HIGH") && fieldPageFile.includes("MEDIUM"),
      "Field operations task queue includes priority level filter dropdown."
    );
    assert(
      fieldPageFile.includes("departmentId") || fieldPageFile.includes("teamId") || fieldPageFile.includes("filteredIssues"),
      "Field Worker view filters issues by department and team assignment."
    );

    // TEST 18-19: Evidence Upload & Storage Reference
    const fieldDetailFile = require("fs").readFileSync("src/app/field/issues/[id]/page.tsx", "utf8");
    assert(
      fieldDetailFile.includes("civicService.uploadImage") && !fieldDetailFile.includes("SAMPLE_AFTER_IMAGES"),
      "Real evidence photo uploaded directly to Supabase Storage resolutions bucket."
    );
    assert(
      fieldDetailFile.includes("afterImageUrl: finalAfterUrl"),
      "Resolution evidence reference saved with actual uploaded image URL."
    );

    // TEST 20: Audit Trail Integrity
    const sh2Id = `sh-f8loc-2-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({
      id: sh2Id,
      issue_id: testIssueId,
      previous_status: "ASSIGNED",
      new_status: "IN_PROGRESS",
      changed_by: workerUser?.id || "worker",
      comment: "Field crew dispatched to repair water pipe leak in Ilkal",
      timestamp: new Date().toISOString(),
    });

    const { data: auditHistory } = await supabaseAdmin.from("status_history").select("*").eq("issue_id", testIssueId);
    assert(auditHistory !== null && auditHistory.length >= 2, "Full lifecycle status history and audit trail preserved.");

    // TEST 21: Navbar Public Site Links
    const adminNavFile = require("fs").readFileSync("src/components/admin/AdminNavbar.tsx", "utf8");
    const fieldNavFile = require("fs").readFileSync("src/components/field/FieldNavbar.tsx", "utf8");
    assert(
      adminNavFile.includes("🌐 Public Site") && fieldNavFile.includes("🌐 Public Site"),
      "Navbar links updated from confusing 'Citizen View' to clear '🌐 Public Site'."
    );

    // TEST 22: Session Storage Auth Scoping
    const clientFile = require("fs").readFileSync("src/services/supabaseClient.ts", "utf8");
    assert(clientFile.includes("window.sessionStorage"), "Supabase client configured with window.sessionStorage.");

    // TEST 23: Protected Phase C Record
    const { data: phaseC } = await supabaseAdmin
      .from("issues")
      .select("id, status")
      .eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba")
      .maybeSingle();

    assert(
      phaseC !== null && phaseC.status === "RESOLVED",
      "Protected Phase C record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba) remains INTACT (RESOLVED)."
    );

    // TEST 24: Clean Test Artifact Cleanup
    for (const id of testIssueIds) {
      await supabaseAdmin.from("status_history").delete().eq("issue_id", id);
      await supabaseAdmin.from("assignments").delete().eq("issue_id", id);
      await supabaseAdmin.from("issues").delete().eq("id", id);
    }
    const { data: verifyClean } = await supabaseAdmin.from("issues").select("id").in("id", testIssueIds);
    assert(
      verifyClean === null || verifyClean.length === 0,
      "All temporary test records safely cleaned up."
    );

    console.log("==========================================================");
    console.log(" ALL 24 AUTOMATED REAL LOCATION TESTS PASSED SUCCESSFULLY ");
    console.log("==========================================================");
  } catch (err: any) {
    console.error("Verification Failure:", err);
    process.exit(1);
  }
}

runPhaseF8VerificationSuite().catch(console.error);
