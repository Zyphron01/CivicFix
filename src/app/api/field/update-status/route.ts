import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { IssueStatus } from "@/types/civic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized: Missing Bearer token." }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Empty session token." }, { status: 401 });
    }

    // Direct server-side token validation via supabaseAdmin
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized: Invalid or expired session token." }, { status: 401 });
    }

    // Fetch user profile to verify role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Forbidden: User profile not found." }, { status: 403 });
    }

    if (profile.role !== "FIELD_WORKER" && profile.role !== "MUNICIPAL_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only authorized Field Workers or Admins can update task status." }, { status: 403 });
    }

    const body = await req.json();
    const { issueId, status, comment } = body as {
      issueId: string;
      status: IssueStatus;
      comment?: string;
    };

    if (!issueId || !status) {
      return NextResponse.json({ error: "Missing required fields: issueId and status are required." }, { status: 400 });
    }

    // Fetch target issue
    const { data: issueRow, error: issueErr } = await supabaseAdmin
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();

    if (issueErr || !issueRow) {
      return NextResponse.json({ error: "Issue not found in database." }, { status: 404 });
    }

    // Team Authorization Enforcement:
    // If user is a FIELD_WORKER, ensure they are assigned to this issue or belong to the assigned team
    if (profile.role === "FIELD_WORKER") {
      const { data: assignments } = await supabaseAdmin
        .from("assignments")
        .select("*")
        .eq("issue_id", issueId)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false })
        .limit(1);

      const activeAsg = assignments && assignments.length > 0 ? assignments[0] : null;
      if (!activeAsg) {
        return NextResponse.json({ error: "Forbidden: This task is not assigned to field operations." }, { status: 403 });
      }

      if (activeAsg.field_worker_id !== user.id) {
        const { data: memberships } = await supabaseAdmin
          .from("team_members")
          .select("team_id")
          .eq("worker_id", user.id);

        const workerTeams = (memberships || []).map((m: any) => m.team_id);
        const assignedTeamId = activeAsg.team_id || (activeAsg.notes?.match(/TEAM_ID:([^|]+)/)?.[1]);

        if (!assignedTeamId || !workerTeams.includes(assignedTeamId)) {
          return NextResponse.json({ error: "Forbidden: You do not belong to the operational crew assigned to this task." }, { status: 403 });
        }
      }
    }

    // Prevent duplicate status history if already in target status
    if (issueRow.status === status) {
      return NextResponse.json({
        success: true,
        message: `Task is already in status ${status}.`,
        status,
      });
    }

    const timestamp = new Date().toISOString();
    const prevStatus = issueRow.status || "SUBMITTED";

    // 1. Update issue row
    const { error: updateErr } = await supabaseAdmin
      .from("issues")
      .update({
        status,
        updated_at: timestamp,
      })
      .eq("id", issueId);

    if (updateErr) {
      console.error("Failed to update issue status:", updateErr);
      return NextResponse.json({ error: updateErr.message || "Failed to update issue status." }, { status: 500 });
    }

    // 2. Insert status_history audit record
    const auditComment = comment || (status === "IN_PROGRESS" ? "Field team arrived on site and commenced work." : `Status updated to ${status}.`);
    await supabaseAdmin.from("status_history").insert({
      id: `sh-field-${Date.now()}`,
      issue_id: issueId,
      previous_status: prevStatus,
      new_status: status,
      changed_by: user.id,
      comment: auditComment,
      timestamp,
    });

    return NextResponse.json({
      success: true,
      status,
      message: `Task status successfully updated to ${status}.`,
    });
  } catch (err: any) {
    console.error("POST /api/field/update-status error:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
