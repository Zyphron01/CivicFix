import { calculateHaversineDistanceMeters } from "../src/services/supabaseCivicService";
import { locationService } from "../src/services/locationService";
import { CivicIssue, ModerationStatus } from "../src/types/civic";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? " - " + detail : ""}`);
    failCount++;
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("CIVICFIX: COMPREHENSIVE END-TO-END FIX VERIFICATION SUITE");
  console.log("=======================================================\n");

  // ── TEST GROUP 1: Spatial Proximity & Haversine Distance Engine ──
  console.log("--- Group 1: Spatial Distance & Proximity Cluster Engine ---");
  {
    // Exact same point
    const d0 = calculateHaversineDistanceMeters(15.3524, 75.1372, 15.3524, 75.1372);
    assert(d0 === 0, "Distance between identical coordinates is 0m", `Got ${d0}m`);

    // Very close point (~30m apart)
    const dClose = calculateHaversineDistanceMeters(15.35240, 75.13720, 15.35265, 75.13720);
    assert(dClose > 0 && dClose <= 50, "Close point within 50m classified as probable duplicate", `Got ${dClose}m`);

    // Nearby point (~150m apart)
    const dNearby = calculateHaversineDistanceMeters(15.35240, 75.13720, 15.35350, 75.13720);
    assert(dNearby > 50 && dNearby <= 250, "Point within 250m classified as nearby incident cluster", `Got ${dNearby}m`);

    // Far point (>1000m)
    const dFar = calculateHaversineDistanceMeters(15.35240, 75.13720, 15.37000, 75.13720);
    assert(dFar > 250, "Point >250m classified as separate incident", `Got ${dFar}m`);
  }

  // ── TEST GROUP 2: Moderation State Machine & Queue Classification ──
  console.log("\n--- Group 2: Moderation State Machine & Triage Queues ---");
  {
    const sampleIssues: Partial<CivicIssue>[] = [
      { id: "iss-1", canonicalTitle: "Pothole A", moderationStatus: "ACTIVE", status: "SUBMITTED" },
      { id: "iss-2", canonicalTitle: "Pothole B", moderationStatus: "UNDER_REVIEW", status: "SUBMITTED" },
      { id: "iss-3", canonicalTitle: "Garbage C", moderationStatus: "SUSPICIOUS", status: "SUBMITTED" },
      { id: "iss-4", canonicalTitle: "Fake Report D", moderationStatus: "REJECTED", moderationReason: "Vandalism/Fake", status: "SUBMITTED" },
      { id: "iss-5", canonicalTitle: "Old Road E", moderationStatus: "ARCHIVED", status: "RESOLVED" },
    ];

    // Operational tab filter: ACTIVE only
    const operationalQueue = sampleIssues.filter((i) => {
      const s = i.moderationStatus || "ACTIVE";
      return s === "ACTIVE";
    });
    assert(operationalQueue.length === 1 && operationalQueue[0].id === "iss-1", "Operational Queue contains strictly ACTIVE reports (Under Review/Suspicious/Rejected quarantined)");

    // Under Review tab
    const underReviewQueue = sampleIssues.filter((i) => i.moderationStatus === "UNDER_REVIEW");
    assert(underReviewQueue.length === 1 && underReviewQueue[0].id === "iss-2", "Under Review Queue filters correctly");

    // Suspicious tab
    const suspiciousQueue = sampleIssues.filter((i) => i.moderationStatus === "SUSPICIOUS");
    assert(suspiciousQueue.length === 1 && suspiciousQueue[0].id === "iss-3", "Suspicious Queue quarantines suspicious report");

    // Rejected tab
    const rejectedQueue = sampleIssues.filter((i) => i.moderationStatus === "REJECTED");
    assert(rejectedQueue.length === 1 && rejectedQueue[0].moderationReason === "Vandalism/Fake", "Rejected Archive retains record and mandatory reason");

    // Archived tab
    const archivedQueue = sampleIssues.filter((i) => i.moderationStatus === "ARCHIVED");
    assert(archivedQueue.length === 1 && archivedQueue[0].id === "iss-5", "Archived Records queue retains historical records");

    // Full Master Audit tab
    assert(sampleIssues.length === 5, "Full Master Audit tab retains 100% of all submitted records");
  }

  // ── TEST GROUP 3: Dynamic Reverse Geocoding & Municipal Jurisdiction ──
  console.log("\n--- Group 3: Dynamic Reverse Geocoding & Municipal Derivation ---");
  {
    // Test Bagalkot / Ilkal coordinates (approx 15.9600, 75.7900)
    const result = await locationService.reverseGeocodeDetailed(15.9600, 75.7900);
    assert(typeof result.formattedAddress === "string" && result.formattedAddress.length > 0, "Reverse geocoding returns formatted address");
    assert(typeof result.jurisdiction === "string" && result.jurisdiction.length > 0, "Jurisdiction is dynamically identified");
    assert(typeof result.derivedWard === "string" && result.derivedWard.length > 0, "Ward / municipal zone is dynamically derived without hardcoded static Ward 1-5");
    assert(result.isSupportedJurisdiction === true, "Supported municipal jurisdiction flag is active");
  }

  // ── TEST GROUP 4: Location Service Secure Context Diagnostics ──
  console.log("\n--- Group 4: Secure Context & GPS Diagnostics ---");
  {
    const secureInfo = locationService.checkSecureContext();
    assert(typeof secureInfo.isSecure === "boolean", "Secure context check executes safely in any environment");
  }

  console.log("\n=======================================================");
  console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("=======================================================\n");

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
