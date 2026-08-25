import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AssignmentTargetType } from "@/types/civic";

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

    // Verify MUNICIPAL_ADMIN role
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

    if (profile.role !== "MUNICIPAL_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only authorized Municipal Administrators can execute routing and assignment." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { issueId, departmentId, fieldWorkerId, targetType = "INDIVIDUAL", teamId, newStatus = "ASSIGNED", comment } = body as {
      issueId: string;
      departmentId: string;
      fieldWorkerId?: string;
      targetType?: AssignmentTargetType;
      teamId?: string;
      newStatus?: string;
      comment?: string;
    };

    if (!issueId || !departmentId) {
      return NextResponse.json({ error: "Missing required fields: issueId or departmentId." }, { status: 400 });
    }

    if (targetType === "INDIVIDUAL" && !fieldWorkerId) {
      return NextResponse.json({ error: "Individual assignment requires a valid fieldWorkerId." }, { status: 400 });
    }

    if (targetType === "TEAM" && !teamId) {
      return NextResponse.json({ error: "Team assignment requires a valid teamId." }, { status: 400 });
    }

    // Fetch target issue
    const { data: currentIssue } = await supabaseAdmin
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();

    if (!currentIssue) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    const prevStatus = currentIssue.status || "SUBMITTED";
    const timestamp = new Date().toISOString();
    const slaHours = calculateSLAHours(currentIssue.priority_level, currentIssue.priority_score);
    const targetDate = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();
    const assignmentId = `asg-${Date.now()}`;

    // Deactivate previous active assignment
    const { data: existingAsgs } = await supabaseAdmin
      .from("assignments")
      .select("*")
      .eq("issue_id", issueId)
      .eq("is_active", true);

    if (existingAsgs && existingAsgs.length > 0) {
      for (const oldAsg of existingAsgs) {
        await supabaseAdmin
          .from("assignments")
          .update({ is_active: false, superseded_at: timestamp, notes: `SUPERSEDED|${oldAsg.notes || ""}` })
          .eq("id", oldAsg.id);
      }
    }

    // Update Issue record
    const issueUpdatePayload: any = {
      department_id: departmentId,
      status: "ASSIGNED",
      updated_at: timestamp,
      team_id: targetType === "TEAM" ? (teamId || null) : null,
    };

    const { error: issueErr } = await supabaseAdmin
      .from("issues")
      .update(issueUpdatePayload)
      .eq("id", issueId);

    if (issueErr) {
      delete issueUpdatePayload.team_id;
      await supabaseAdmin.from("issues").update(issueUpdatePayload).eq("id", issueId);
    }

    // Insert new Assignment record
    const notesMetadata = targetType === "TEAM" ? `TARGET_TYPE:TEAM|TEAM_ID:${teamId}` : `TARGET_TYPE:INDIVIDUAL`;
    const insertPayload: any = {
      id: assignmentId,
      issue_id: issueId,
      department_id: departmentId,
      field_worker_id: targetType === "INDIVIDUAL" ? (fieldWorkerId || null) : null,
      assigned_at: timestamp,
      target_resolution_date: targetDate,
      notes: notesMetadata,
      is_active: true,
      target_type: targetType,
      team_id: targetType === "TEAM" ? (teamId || null) : null,
    };

    const { error: asgErr } = await supabaseAdmin.from("assignments").insert(insertPayload);
    if (asgErr) {
      delete insertPayload.target_type;
      delete insertPayload.team_id;
      delete insertPayload.is_active;
      await supabaseAdmin.from("assignments").insert(insertPayload);
    }

    // Audit log entry
    const auditComment = comment || (targetType === "TEAM" 
      ? `Assigned to team ${teamId} (${departmentId})`
      : `Assigned to worker ${fieldWorkerId} (${departmentId})`);

    await supabaseAdmin.from("status_history").insert({
      id: `sh-asg-${Date.now()}`,
      issue_id: issueId,
      previous_status: prevStatus,
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
      targetResolutionDate: targetDate,
    });
  } catch (err: any) {
    console.error("Admin Assignment Error:", err);
    return NextResponse.json({ error: err.message || "Failed to execute assignment." }, { status: 500 });
  }
}
