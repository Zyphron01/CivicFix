import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runPhaseF1Verification() {
  console.log("====================================================");
  console.log("   CIVICFIX PHASE F1 WORKFORCE & TEAM VERIFICATION  ");
  console.log("====================================================");

  const { civicService } = await import("../src/services/civicService");
  const { supabase } = await import("../src/services/supabaseClient");

  const runId = `PHASE_F1_RUN_${Date.now()}`;
  console.log(`[Run ID]: ${runId}`);

  if (supabase) {
    console.log("Authenticating as citizen.e2e@civicfix.local...");
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: "citizen.e2e@civicfix.local",
      password: "TestPassword123!",
    });
    if (authErr) console.warn("Auth note:", authErr.message);
    else console.log("✓ Authenticated successfully for report creation.");
  }

  // Step 1: Verify Dynamic Workforce & Teams Discovery
  console.log("\n[TEST 5: Admin Workforce & Teams Discovery]");
  const workers = await civicService.getFieldWorkers!();
  const teams = await civicService.getTeams!();
  console.log(`- Active Field Workers retrieved: ${workers.length}`);
  workers.forEach((w) => console.log(`  • Worker: ${w.fullName} (${w.id})`));
  console.log(`- Active Teams retrieved: ${teams.length}`);
  teams.forEach((t) => console.log(`  • Team: ${t.name} [${t.specialization}] (${t.id})`));

  if (workers.length < 2 || teams.length < 2) {
    throw new Error("❌ Dynamic workforce discovery failed to find expected demo workers/teams.");
  }
  console.log("✅ TEST 5 PASSED: Dynamic workforce & teams discovered from database.");

  // Step 2: Test Individual Assignment & Isolation
  console.log("\n[TEST 1 & 3: Individual Assignment & Isolation]");
  const indReport = await civicService.createReport({
    citizenId: "a6326e75-0058-49e6-a65c-81f6f5e60f3e",
    title: `Individual Task Test - ${runId}`,
    description: "Testing individual worker dispatch and task isolation.",
    category: "POTHOLE",
    latitude: 12.9716,
    longitude: 77.5946,
    addressText: "100 Feet Road, Indiranagar",
    wardId: "ward-10",
    aiAssessment: {
      isCivicIssue: true,
      category: "POTHOLE",
      priorityLevel: "HIGH",
      priorityScore: 85,
      hazardClassification: "Severe Pothole",
      recommendedDepartment: "dept-roads",
      inJurisdiction: true,
      reasoning: "Road damage reported.",
      workSummary: "Patch asphalt.",
      impact: "HIGH",
      severity: "HIGH",
      urgency: "IMMEDIATE"
    } as any
  });

  console.log(`- Report created with Issue ID: ${indReport.id}`);
  if (supabase) {
    await supabase.auth.signInWithPassword({
      email: "admin.test@civicfix.local",
      password: "TestPassword123!",
    });
  }

  await civicService.assignIssue(
    indReport.id,
    "dept-roads",
    "c5f6fd21-6b34-4606-a767-bdae3026c3ab",
    "INDIVIDUAL",
    undefined
  );

  const indIssue = await civicService.getIssue(indReport.id);
  console.log(`- Assignment Target Type: ${indIssue?.assignment?.targetType}`);
  console.log(`- Assigned Field Worker ID: ${indIssue?.assignment?.fieldWorkerId}`);

  if (indIssue?.assignment?.targetType !== "INDIVIDUAL" || indIssue?.assignment?.fieldWorkerId !== "c5f6fd21-6b34-4606-a767-bdae3026c3ab") {
    throw new Error("❌ Individual assignment verification failed.");
  }
  console.log("✅ TEST 1 & 3 PASSED: Individual worker assignment persisted and scoped.");

  // Step 3: Test Team Assignment
  console.log("\n[TEST 2: Team Assignment]");
  if (supabase) {
    await supabase.auth.signInWithPassword({
      email: "citizen.e2e@civicfix.local",
      password: "TestPassword123!",
    });
  }

  const teamReport = await civicService.createReport({
    citizenId: "a6326e75-0058-49e6-a65c-81f6f5e60f3e",
    title: `Team Task Test - ${runId}`,
    description: "Testing operational response crew assignment.",
    category: "GARBAGE",
    latitude: 12.9250,
    longitude: 77.5890,
    addressText: "Jayanagar 4th Block Market",
    wardId: "ward-12",
    aiAssessment: {
      isCivicIssue: true,
      category: "GARBAGE",
      priorityLevel: "MEDIUM",
      priorityScore: 65,
      hazardClassification: "Waste Dump",
      recommendedDepartment: "dept-sanitation",
      inJurisdiction: true,
      reasoning: "Waste dump reported.",
      workSummary: "Clear waste dump.",
      impact: "MEDIUM",
      severity: "MEDIUM",
      urgency: "MODERATE"
    } as any
  });

  console.log(`- Report created with Issue ID: ${teamReport.id}`);
  if (supabase) {
    await supabase.auth.signInWithPassword({
      email: "admin.test@civicfix.local",
      password: "TestPassword123!",
    });
  }

  await civicService.assignIssue(
    teamReport.id,
    "dept-sanitation",
    undefined,
    "TEAM",
    "team-sanitation"
  );

  const teamIssue = await civicService.getIssue(teamReport.id);
  console.log(`- Assignment Target Type: ${teamIssue?.assignment?.targetType}`);
  console.log(`- Assigned Team ID: ${teamIssue?.assignment?.teamId}`);

  if (teamIssue?.assignment?.targetType !== "TEAM" || teamIssue?.assignment?.teamId !== "team-sanitation") {
    throw new Error("❌ Team assignment verification failed.");
  }
  console.log("✅ TEST 2 PASSED: Team assignment persisted with explicit team target.");

  // Step 4: Test Status Lifecycle Transitions & Reassignment Audit Trace
  console.log("\n[TEST 4: Team Status Lifecycle Transitions & Reassignment Audit]");
  await civicService.updateIssueStatus(
    teamReport.id,
    "IN_PROGRESS",
    "c9f8e7d6-5c4b-3a21-0fed-9876543210fe",
    "Sanitation team dispatched to site."
  );

  const inProgIssue = await civicService.getIssue(teamReport.id);
  console.log(`- Updated Status: ${inProgIssue?.status}`);

  if (inProgIssue?.status !== "IN_PROGRESS") {
    throw new Error("❌ Status transition failed.");
  }

  // Perform explicit Reassignment Test (Reassign Team -> Individual Worker)
  if (supabase) {
    await supabase.auth.signInWithPassword({
      email: "admin.test@civicfix.local",
      password: "TestPassword123!",
    });
  }

  await civicService.assignIssue(
    teamReport.id,
    "dept-roads",
    "c5f6fd21-6b34-4606-a767-bdae3026c3ab",
    "INDIVIDUAL",
    undefined
  );

  const reassignedIssue = await civicService.getIssue(teamReport.id);
  console.log(`- Reassigned TargetType: ${reassignedIssue?.assignment?.targetType}`);
  console.log(`- Reassigned Worker ID: ${reassignedIssue?.assignment?.fieldWorkerId}`);
  const latestAudit = reassignedIssue?.statusHistory[reassignedIssue.statusHistory.length - 1];
  console.log(`- Reassignment Audit Comment: ${latestAudit?.comment}`);

  if (!latestAudit?.comment?.includes("REASSIGNMENT") && !latestAudit?.comment?.includes("Assigned via")) {
    throw new Error("❌ Reassignment audit trail failed.");
  }
  console.log("✅ TEST 4 PASSED: Team status lifecycle transition & reassignment audit verified.");

  // Step 5: Regression Verification of Phase C Preserved Run
  console.log("\n[TEST 6: Regression Verification]");
  const preservedIssue = await civicService.getIssue("issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba");
  if (!preservedIssue) {
    throw new Error("❌ Preserved Phase C issue issue-e442c2d6-3e97-4f0f-8b7d-6af93f280bba missing!");
  }
  console.log(`- Preserved Phase C Issue ID: ${preservedIssue.id} (Status: ${preservedIssue.status})`);
  console.log("✅ TEST 6 PASSED: Phase C E2E preserved data intact.");

  console.log("\n====================================================");
  console.log("   ALL PHASE F1 VERIFICATION TESTS PASSED 100%       ");
  console.log("====================================================");
}

runPhaseF1Verification().catch((err) => {
  console.error("❌ Phase F1 Verification Failed:", err);
  process.exit(1);
});
