import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function calculateSLAHours(priorityLevel?: string, priorityScore?: number): number {
  if (priorityLevel === "CRITICAL" || (priorityScore !== undefined && priorityScore >= 80)) return 24;
  if (priorityLevel === "HIGH" || (priorityScore !== undefined && priorityScore >= 60)) return 48;
  if (priorityLevel === "MEDIUM" || (priorityScore !== undefined && priorityScore >= 40)) return 72;
  return 120;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized: Missing or malformed Bearer token." }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Empty session token." }, { status: 401 });
    }

    // Direct server-side token validation via supabaseAdmin
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired session token." },
        { status: 401 }
      );
    }

    // Verify authorized role (MUNICIPAL_ADMIN or FIELD_WORKER supervisor)
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json(
        { error: "Forbidden: User profile not found." },
        { status: 403 }
      );
    }

    if (profile.role !== "MUNICIPAL_ADMIN" && profile.role !== "FIELD_WORKER") {
      return NextResponse.json(
        { error: "Forbidden: Only authorized Municipal Administrators or Field Supervisors can assign internal workforce." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { issueId, targetType = "TEAM", teamId, fieldWorkerId, assignmentNotes } = body as {
      issueId: string;
      targetType: "INDIVIDUAL" | "TEAM";
      teamId?: string;
      fieldWorkerId?: string;
      assignmentNotes?: string;
    };

    if (!issueId) {
      return NextResponse.json({ error: "Missing required field: issueId." }, { status: 400 });
    }

    if (targetType === "TEAM" && !teamId) {
      return NextResponse.json({ error: "Team assignment requires a valid teamId." }, { status: 400 });
    }

    if (targetType === "INDIVIDUAL" && !fieldWorkerId) {
      return NextResponse.json({ error: "Individual worker assignment requires a valid fieldWorkerId." }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    // Fetch issue details
    const { data: currentIssue } = await supabaseAdmin
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();

    if (!currentIssue) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    const departmentId = currentIssue.department_id || "dept-roads";
    const slaHours = calculateSLAHours(currentIssue.priority_level, currentIssue.priority_score);
    const targetResolutionDate = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();
    const assignmentId = `asg-dept-${Date.now()}`;

    // Deactivate previous active assignment
    await supabaseAdmin
      .from("assignments")
      .update({ is_active: false, superseded_at: timestamp, notes: "SUPERSEDED|Reassigned by department" })
      .eq("issue_id", issueId)
      .eq("is_active", true);

    // Insert new internal assignment
    const notesMetadata = targetType === "TEAM"
      ? `TARGET_TYPE:TEAM|TEAM_ID:${teamId}${assignmentNotes ? `|NOTES:${assignmentNotes}` : ""}`
      : `TARGET_TYPE:INDIVIDUAL|WORKER_ID:${fieldWorkerId}${assignmentNotes ? `|NOTES:${assignmentNotes}` : ""}`;

    const { error: asgErr } = await supabaseAdmin.from("assignments").insert({
      id: assignmentId,
      issue_id: issueId,
      department_id: departmentId,
      field_worker_id: targetType === "INDIVIDUAL" ? (fieldWorkerId || null) : null,
      team_id: targetType === "TEAM" ? (teamId || null) : null,
      target_type: targetType,
      assigned_at: timestamp,
      target_resolution_date: targetResolutionDate,
      notes: notesMetadata,
      is_active: true,
    });

    if (asgErr) {
      console.error("Internal Assignment insert error:", asgErr);
      return NextResponse.json({ error: asgErr.message || "Failed to create internal assignment record." }, { status: 500 });
    }

    // Update issue status to ASSIGNED
    await supabaseAdmin.from("issues").update({
      status: "ASSIGNED",
      team_id: targetType === "TEAM" ? (teamId || null) : null,
      updated_at: timestamp,
    }).eq("id", issueId);

    // Log status history
    const targetLabel = targetType === "TEAM" ? `Team:${teamId}` : `Worker:${fieldWorkerId}`;
    const auditComment = `INTERNAL_ASSIGNMENT: Department assigned to [${targetLabel}]${assignmentNotes ? ` (Notes: ${assignmentNotes})` : ""}`;

    await supabaseAdmin.from("status_history").insert({
      id: `sh-dept-asg-${Date.now()}`,
      issue_id: issueId,
      previous_status: currentIssue.status || "ROUTED_TO_DEPARTMENT",
      new_status: "ASSIGNED",
      changed_by: user.id,
      comment: auditComment,
      timestamp,
    });

    return NextResponse.json({
      success: true,
      issueId,
      assignmentId,
      status: "ASSIGNED",
      targetType,
      targetResolutionDate,
    });
  } catch (err: any) {
    console.error("Department Internal Assignment Error:", err);
    return NextResponse.json({ error: err.message || "Failed to assign issue internally." }, { status: 500 });
  }
}
