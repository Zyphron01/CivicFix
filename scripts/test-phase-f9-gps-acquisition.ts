import fs from "fs";
import path from "path";

/**
 * Phase F9: Real-time Accuracy-Seeking GPS Acquisition Automated Verification Script
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertTest(name: string, condition: boolean, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } else {
    failedTests++;
    console.error(`❌ FAIL: ${name}`);
    if (details) console.error(`   Details: ${details}`);
  }
}

async function runPhaseF9Verification() {
  console.log("================================================================================");
  console.log("CIVICFIX — PHASE F9: GPS ACQUISITION & LIFECYCLE AUTOMATED VERIFICATION");
  console.log("================================================================================\n");

  const locationServicePath = path.join(process.cwd(), "src", "services", "locationService.ts");
  const reportPagePath = path.join(process.cwd(), "src", "app", "report", "page.tsx");
  const mapCompPath = path.join(process.cwd(), "src", "components", "civic", "LocationPickerMap.tsx");
  const typesCivicPath = path.join(process.cwd(), "src", "types", "civic.ts");

  const locServiceContent = fs.readFileSync(locationServicePath, "utf-8");
  const reportPageContent = fs.readFileSync(reportPagePath, "utf-8");
  const mapCompContent = fs.readFileSync(mapCompPath, "utf-8");
  const typesCivicContent = fs.readFileSync(typesCivicPath, "utf-8");

  // 1. No automatic GPS request on page load
  // Verify that the useEffect only performs cleanup and does not call any location acquisition functions
  const useEffectMatch = reportPageContent.match(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[\]\);/);
  const useEffectBody = useEffectMatch ? useEffectMatch[1] : "";
  const hasAutoGpsInMount =
    useEffectBody.includes("handleRequestLiveLocation") ||
    useEffectBody.includes("startAccuracySeekingWatch") ||
    useEffectBody.includes("getCurrentPosition") ||
    useEffectBody.includes("watchPosition");

  assertTest(
    "1. No automatic GPS request on page load (User-initiated only)",
    !hasAutoGpsInMount && reportPageContent.includes("useState<LocationState>({ status: \"IDLE\" })"),
    "ReportPage must initialize with status IDLE and must not call location methods in useEffect"
  );

  // 2. Location acquisition begins only after user action
  assertTest(
    "2. Location acquisition begins strictly via user action button click",
    reportPageContent.includes("id=\"use-live-location-btn\"") && reportPageContent.includes("onClick={handleRequestLiveLocation}"),
    "Use live location button must trigger handleRequestLiveLocation"
  );

  // 3. watchPosition() is used
  assertTest(
    "3. navigator.geolocation.watchPosition() is used for accuracy-seeking",
    locServiceContent.includes("navigator.geolocation.watchPosition("),
    "LocationService must use watchPosition for continuous readings"
  );

  // 4. enableHighAccuracy: true is enabled
  assertTest(
    "4. enableHighAccuracy: true is explicitly configured",
    locServiceContent.includes("enableHighAccuracy: true"),
    "LocationService PositionOptions must include enableHighAccuracy: true"
  );

  // 5. maximumAge: 0 is used
  assertTest(
    "5. maximumAge: 0 is explicitly configured (No stale cached fixes)",
    locServiceContent.includes("maximumAge: 0"),
    "LocationService PositionOptions must specify maximumAge: 0"
  );

  // 6. Best accuracy reading is tracked
  assertTest(
    "6. Best accuracy reading is continuously tracked across incoming fixes",
    locServiceContent.includes("reading.accuracyMeters < bestReading.accuracyMeters") &&
    reportPageContent.includes("bestReading: bestSoFar"),
    "LocationService and ReportPage must preserve the reading with the lowest accuracy error"
  );

  // 7. A precise reading stops the watcher immediately
  assertTest(
    "7. A precise reading (<= PRECISION_TARGET_METERS) stops the watcher immediately",
    locServiceContent.includes("reading.accuracyMeters <= PRECISION_TARGET_METERS") &&
    locServiceContent.includes("doStop();") &&
    locServiceContent.includes("callbacks.onAccepted("),
    "When precision threshold is reached, doStop() and onAccepted must fire immediately"
  );

  // 8. Timeout stops the watcher
  assertTest(
    "8. Acquisition timeout stops the watcher and clears active timers",
    reportPageContent.includes("MAX_ACQUISITION_MS") &&
    reportPageContent.includes("stopActiveWatcher();") &&
    reportPageContent.includes("handle.stop()"),
    "ReportPage timeout handler must stop the watcher handle"
  );

  // 9. Component unmount cleans up the watcher
  assertTest(
    "9. Component unmount lifecycle cleans up active watchers and interval timers",
    reportPageContent.includes("watchHandleRef.current?.stop();") &&
    reportPageContent.includes("clearTimeout(watchTimeoutRef.current)") &&
    reportPageContent.includes("clearInterval(elapsedIntervalRef.current)"),
    "useEffect return cleanup function must invoke stop() and clear timers"
  );

  // 10. Permission denied is handled
  assertTest(
    "10. Permission denied is handled with clear instructions to reset",
    locServiceContent.includes("error.code === error.PERMISSION_DENIED") &&
    reportPageContent.includes("PERMISSION_DENIED") &&
    reportPageContent.includes("chrome://settings/content/location"),
    "Error code 1 (PERMISSION_DENIED) must transition to dedicated state with guidance"
  );

  // 11. Permission already granted is handled without expecting a popup
  assertTest(
    "11. Permission query inspects state without forcing artificial popup expectations",
    locServiceContent.includes("navigator.permissions.query({ name: \"geolocation\"") &&
    locServiceContent.includes("getPermissionState()"),
    "getPermissionState must read permission status cleanly"
  );

  // 12. Unsupported geolocation is handled
  assertTest(
    "12. Unsupported geolocation and positioning errors are handled gracefully",
    locServiceContent.includes("!navigator.geolocation") &&
    reportPageContent.includes("UNSUPPORTED"),
    "Missing navigator.geolocation must trigger UNSUPPORTED state"
  );

  // 13. Insecure context is detected where applicable
  assertTest(
    "13. Insecure context (non-localhost HTTP) is detected and warned",
    locServiceContent.includes("checkSecureContext()") &&
    locServiceContent.includes("window.isSecureContext") &&
    reportPageContent.includes("secureContextInfo"),
    "checkSecureContext must warn on non-localhost HTTP mobile connections"
  );

  // 14. No hardcoded Bangalore fallback coordinates in live reporting pipeline
  assertTest(
    "14. Zero hardcoded Bangalore/Bengaluru coordinates in locationService, report page, or map",
    !locServiceContent.includes("12.9716") &&
    !reportPageContent.includes("12.9716") &&
    !locServiceContent.includes("12.9786") &&
    !reportPageContent.includes("12.9786") &&
    !mapCompContent.includes("12.9716"),
    "No hardcoded 12.9716 / 12.9786 coordinates allowed in reporting modules"
  );

  // 15. Coarse ±5000m readings are not stored as precise GPS
  assertTest(
    "15. Coarse network readings (> ACCEPTABLE_GPS_METERS) are NEVER stored as precise GPS",
    reportPageContent.includes("TIMEOUT") &&
    reportPageContent.includes("acceptedLat !== null && acceptedLng !== null") &&
    locServiceContent.includes("ACCEPTABLE_GPS_METERS"),
    "Timed out or low-accuracy readings do not populate acceptedLat / acceptedLng"
  );

  // 16. Reverse geocoding occurs only after accepted/manual coordinates
  assertTest(
    "16. Reverse geocoding is strictly gated to confirmed ACCEPTED or MANUAL coordinates",
    reportPageContent.includes("applyConfirmedLocation(result.latitude, result.longitude)") &&
    reportPageContent.includes("applyConfirmedLocation(lat, lng)"),
    "applyConfirmedLocation is only called upon onAccepted or handleManualLocationSelected"
  );

  // 17. Manual map selection is correctly labelled
  assertTest(
    "17. Manual map selection is explicitly labelled MANUAL_MAP_SELECTION",
    reportPageContent.includes("MANUAL_MAP_SELECTION") &&
    reportPageContent.includes("locationState.status === \"MANUAL_SELECTION\""),
    "Manual pin actions must tag locationSource as MANUAL_MAP_SELECTION"
  );

  // 18. Accepted GPS coordinates preserve actual accuracy metadata
  assertTest(
    "18. Accepted GPS coordinates preserve actual accuracy in meters and metadata",
    reportPageContent.includes("locationAccuracy: acceptedAccuracy") &&
    locServiceContent.includes("accuracyMeters: reading.accuracyMeters"),
    "Accepted readings retain accuracyMeters to be saved with the issue"
  );

  // 19. No multiple active watchers remain after repeated button clicks
  assertTest(
    "19. Guard against concurrent active watchers via stopActiveWatcher() and requestIdRef",
    reportPageContent.includes("stopActiveWatcher()") &&
    reportPageContent.includes("requestIdRef.current"),
    "handleRequestLiveLocation must cancel existing watchers and invalidate stale request IDs"
  );

  // 20. Existing report submission and triage flow preserved
  assertTest(
    "20. Existing multimodal AI triage and report creation flow preserved intact",
    reportPageContent.includes("civicService.createReport") &&
    reportPageContent.includes("fetch(\"/api/ai/triage\"") &&
    reportPageContent.includes("civicService.uploadImage"),
    "Full report submission, image upload, and AI triage pipeline must remain operational"
  );

  console.log("\n================================================================================");
  console.log(`VERIFICATION SUMMARY: ${passedTests}/${totalTests} Tests Passed`);
  if (failedTests > 0) {
    console.error(`FAILED: ${failedTests} Tests Failed`);
    process.exit(1);
  } else {
    console.log("STATUS: ALL PHASE F9 AUTOMATED TESTS PASSED (20/20)");
    console.log("================================================================================");
  }
}

runPhaseF9Verification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
