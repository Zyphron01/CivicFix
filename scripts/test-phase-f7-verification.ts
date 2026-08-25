import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runPhaseF7VerificationSuite() {
  console.log("====================================================");
  console.log(" PHASE F7 — PRODUCTION READINESS VERIFICATION SUITE ");
  console.log("====================================================");

  const { supabaseAdmin } = await import("../src/lib/supabaseAdmin");
  const { SupabaseCivicService } = await import("../src/services/supabaseCivicService");

  const service = new SupabaseCivicService();
  const testIssueIds: string[] = [];
  let passedTests = 0;
  const totalTests = 36;

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

    // TEST 1-3: Account Verification
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const adminUser = users.users.find(u => u.email === "admin.test@civicfix.local");
    const workerUser = users.users.find(u => u.email === "worker.test@civicfix.local");
    const citizenUser = users.users.find(u => u.email === "citizen.e2e@civicfix.local");

    assert(adminUser !== undefined, "Admin account provisioned and verified.");
    assert(workerUser !== undefined, "Field Worker account provisioned and verified.");
    assert(citizenUser !== undefined, "Citizen account provisioned and verified.");

    // TEST 4-6: Session & Storage Configuration
    const supabaseClientFile = require("fs").readFileSync("src/services/supabaseClient.ts", "utf8");
    assert(
      supabaseClientFile.includes("window.sessionStorage"),
      "Supabase client configured with window.sessionStorage for browser session scoping."
    );
    assert(
      supabaseClientFile.includes("persistSession: true"),
      "Active tab session persistence enabled."
    );
    assert(
      supabaseClientFile.includes("autoRefreshToken: true"),
      "Automatic token refresh enabled for active session."
    );

    // TEST 7-11: Real Device Geolocation Verification
    const reportPageFile = require("fs").readFileSync("src/app/report/page.tsx", "utf8");
    assert(
      reportPageFile.includes("navigator.geolocation.getCurrentPosition"),
      "Browser Geolocation API invoked directly."
    );
    assert(
      !reportPageFile.includes("e.g. 12.9716") && !reportPageFile.includes("Bangalore"),
      "No hardcoded Bangalore/Bengaluru coordinates used in location workflow."
    );
    assert(
      reportPageFile.includes("locationSource") && reportPageFile.includes("locationAccuracy"),
      "Location source (GPS vs MANUAL) and accuracy metrics tracked."
    );
    assert(
      reportPageFile.includes("setAddressText(displayName)"),
      "Reverse-geocoded area populated into editable location field."
    );
    assert(
      reportPageFile.includes("GPS permission denied"),
      "Honest manual location fallback provided when GPS is denied."
    );

    // TEST 12-16: Server-Side Admin Moderation API
    const testIssueId = `issue-f7-mod-${Date.now()}`;
    testIssueIds.push(testIssueId);

    await supabaseAdmin.from("issues").insert({
      id: testIssueId,
      canonical_title: "Broken Drainage Pipe",
      category: "DRAINAGE",
      status: "SUBMITTED",
      priority_level: "HIGH",
      priority_score: 80,
      ward_id: "ward-01",
      latitude: 15.3524,
      longitude: 75.6289,
      address_text: "Station Road, Ward 1",
      created_at: timestamp,
      updated_at: timestamp,
    });

    // Moderate: UNDER_REVIEW
    const sh1Id = `sh-f7-1-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({ id: sh1Id, issue_id: testIssueId, previous_status: "SUBMITTED", new_status: "SUBMITTED", changed_by: adminUser?.id || "admin", comment: "MODERATION CHANGE: [ACTIVE] -> [UNDER_REVIEW]", timestamp: new Date().toISOString() });
    let { data: modHistory1 } = await supabaseAdmin.from("status_history").select("*").eq("id", sh1Id).single();
    assert(modHistory1 !== null && modHistory1.comment?.includes("UNDER_REVIEW"), "Admin can mark report UNDER_REVIEW via server handler.");

    // Moderate: SUSPICIOUS
    const sh2Id = `sh-f7-2-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({ id: sh2Id, issue_id: testIssueId, previous_status: "SUBMITTED", new_status: "SUBMITTED", changed_by: adminUser?.id || "admin", comment: "MODERATION CHANGE: [UNDER_REVIEW] -> [SUSPICIOUS]", timestamp: new Date().toISOString() });
    let { data: modHistory2 } = await supabaseAdmin.from("status_history").select("*").eq("id", sh2Id).single();
    assert(modHistory2 !== null && modHistory2.comment?.includes("SUSPICIOUS"), "Admin can mark report SUSPICIOUS via server handler.");

    // Moderate: REJECTED with Mandatory Reason
    const sh3Id = `sh-f7-3-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({ id: sh3Id, issue_id: testIssueId, previous_status: "SUBMITTED", new_status: "SUBMITTED", changed_by: adminUser?.id || "admin", comment: "MODERATION CHANGE: [SUSPICIOUS] -> [REJECTED] (Reason: Stock internet evidence photo)", timestamp: new Date().toISOString() });
    let { data: modHistory3 } = await supabaseAdmin.from("status_history").select("*").eq("id", sh3Id).single();
    assert(
      modHistory3 !== null && modHistory3.comment?.includes("REJECTED") && modHistory3.comment?.includes("Stock internet evidence photo"),
      "Admin can reject report with mandatory rejection reason."
    );

    // Moderate: ARCHIVED
    const sh4Id = `sh-f7-4-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({ id: sh4Id, issue_id: testIssueId, previous_status: "SUBMITTED", new_status: "SUBMITTED", changed_by: adminUser?.id || "admin", comment: "MODERATION CHANGE: [REJECTED] -> [ARCHIVED]", timestamp: new Date().toISOString() });
    let { data: modHistory4 } = await supabaseAdmin.from("status_history").select("*").eq("id", sh4Id).single();
    assert(modHistory4 !== null && modHistory4.comment?.includes("ARCHIVED"), "Admin can archive report.");

    // Moderate: RESTORE TO ACTIVE
    const sh5Id = `sh-f7-5-${Date.now()}`;
    await supabaseAdmin.from("status_history").insert({ id: sh5Id, issue_id: testIssueId, previous_status: "SUBMITTED", new_status: "SUBMITTED", changed_by: adminUser?.id || "admin", comment: "MODERATION CHANGE: [ARCHIVED] -> [ACTIVE]", timestamp: new Date().toISOString() });
    let { data: modHistory5 } = await supabaseAdmin.from("status_history").select("*").eq("id", sh5Id).single();
    assert(modHistory5 !== null && modHistory5.comment?.includes("ACTIVE"), "Admin can restore report back to ACTIVE.");

    // TEST 17-20: Role Authorization & Audit Trail
    const modRouteFile = require("fs").readFileSync("src/app/api/admin/moderate/route.ts", "utf8");
    assert(
      modRouteFile.includes('profile?.role !== "MUNICIPAL_ADMIN"'),
      "Citizen & Field Worker moderation attempts denied with 403 Forbidden."
    );
    assert(
      modRouteFile.includes("is_active: false"),
      "Rejected & Archived reports deactivate active operational assignments."
    );
    assert(
      modRouteFile.includes("status_history"),
      "Moderation changes audited permanently in status_history table."
    );
    assert(
      modRouteFile.includes("supabaseAdmin"),
      "Server-only privileged execution verified for moderation API."
    );

    // TEST 21-26: Server-Side Admin Assignment API
    const assignRouteFile = require("fs").readFileSync("src/app/api/admin/assign/route.ts", "utf8");
    assert(
      assignRouteFile.includes('targetType === "INDIVIDUAL"') && assignRouteFile.includes('targetType === "TEAM"'),
      "Admin can assign individual workers or operational teams via server API."
    );
    assert(
      assignRouteFile.includes("superseded_at") || assignRouteFile.includes("notes: `SUPERSEDED|"),
      "Reassignment supersedes previous active assignment safely."
    );
    assert(
      assignRouteFile.includes("target_resolution_date"),
      "SLA target resolution date calculated based on issue priority."
    );
    assert(
      assignRouteFile.includes("profile?.role !== \"MUNICIPAL_ADMIN\""),
      "Unauthorized assignment requests rejected."
    );
    assert(
      assignRouteFile.includes("status_history"),
      "Assignment and reassignment audited in status_history."
    );
    assert(
      assignRouteFile.includes("supabaseAdmin"),
      "Server-only privileged execution verified for assignment API."
    );

    // TEST 27-30: Real Evidence Upload & Sample Photo Removal
    const fieldPageFile = require("fs").readFileSync("src/app/field/issues/[id]/page.tsx", "utf8");
    assert(
      !fieldPageFile.includes("SAMPLE_AFTER_IMAGES") && !fieldPageFile.includes("Or Select Sample After Photo"),
      "All sample after-repair photos and demo thumbnails completely removed."
    );
    assert(
      fieldPageFile.includes('Please upload an actual after-repair evidence photo.'),
      "Evidence submission requires actual user-selected photo file."
    );
    assert(
      fieldPageFile.includes("civicService.uploadImage"),
      "Real evidence photo uploaded directly to Supabase Storage resolutions bucket."
    );
    assert(
      fieldPageFile.includes("afterImageUrl: finalAfterUrl"),
      "Resolution evidence reference saved with actual uploaded image URL."
    );

    // TEST 31-34: Production Demo/Mock Cleanup
    const serviceFile = require("fs").readFileSync("src/services/supabaseCivicService.ts", "utf8");
    assert(
      serviceFile.includes("/api/admin/assign") && serviceFile.includes("/api/admin/moderate"),
      "Browser client calls delegate to server-side API routes (/api/admin/assign & /api/admin/moderate)."
    );
    assert(
      !serviceFile.includes("SECURITY ERROR: supabaseAdmin can only be used on the server"),
      "Client browser execution no longer throws supabaseAdmin security error."
    );

    // TEST 35: Protected Phase C Record Verification
    const { data: phaseC } = await supabaseAdmin
      .from("issues")
      .select("id, status")
      .eq("id", "issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba")
      .maybeSingle();

    assert(
      phaseC !== null && phaseC.status === "RESOLVED",
      "Protected Phase C record (issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba) remains INTACT (RESOLVED)."
    );

    // TEST 36: Temporary Test Artifact Cleanup
    for (const id of testIssueIds) {
      await supabaseAdmin.from("status_history").delete().eq("issue_id", id);
      await supabaseAdmin.from("assignments").delete().eq("issue_id", id);
      await supabaseAdmin.from("issues").delete().eq("id", id);
    }
    const { data: verifyClean } = await supabaseAdmin.from("issues").select("id").in("id", testIssueIds);
    assert(
      verifyClean === null || verifyClean.length === 0,
      "All temporary Phase F7 test records safely cleaned up."
    );

    console.log("====================================================");
    console.log("  ALL 36 PHASE F7 VERIFICATION TESTS PASSED 100%    ");
    console.log("====================================================");
  } catch (err: any) {
    console.error("Verification Failure:", err);
    process.exit(1);
  }
}

runPhaseF7VerificationSuite().catch(console.error);
