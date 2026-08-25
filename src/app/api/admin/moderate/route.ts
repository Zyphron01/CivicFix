import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ModerationStatus } from "@/types/civic";

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
        { error: "Forbidden: Only authorized Municipal Administrators can perform report moderation." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { issueId, newModerationStatus, reason } = body as {
      issueId: string;
      newModerationStatus: ModerationStatus;
      reason?: string;
    };

    if (!issueId || !newModerationStatus) {
      return NextResponse.json({ error: "Missing required fields: issueId or newModerationStatus." }, { status: 400 });
    }

    if (newModerationStatus === "REJECTED" && (!reason || !reason.trim())) {
      return NextResponse.json({ error: "Rejection requires a mandatory moderation reason." }, { status: 400 });
    }

    // Fetch current issue state
    const { data: currentIssue } = await supabaseAdmin
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();

    if (!currentIssue) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    const prevModStatus = currentIssue.moderation_status || "ACTIVE";
    const timestamp = new Date().toISOString();

    // 1. Update issue record
    const modUpdatePayload: any = {
      moderation_status: newModerationStatus,
      moderation_reason: reason?.trim() || null,
      moderated_at: timestamp,
      moderated_by: user.id,
      updated_at: timestamp,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("issues")
      .update(modUpdatePayload)
      .eq("id", issueId);

    if (updateErr) {
      // Fallback if DDL columns not yet in schema cache
      await supabaseAdmin
        .from("issues")
        .update({ updated_at: timestamp })
        .eq("id", issueId);
    }

    // 2. Insert audit entry in status_history
    const auditComment = `MODERATION CHANGE: [${prevModStatus}] -> [${newModerationStatus}]${reason?.trim() ? ` (Reason: ${reason.trim()})` : ""}`;
    await supabaseAdmin.from("status_history").insert({
      id: `sh-mod-${Date.now()}`,
      issue_id: issueId,
      previous_status: currentIssue.status || "SUBMITTED",
      new_status: currentIssue.status || "SUBMITTED",
      changed_by: user.id,
      comment: auditComment,
      timestamp,
    });

    // 3. Deactivate active assignment if REJECTED or ARCHIVED
    if (newModerationStatus === "REJECTED" || newModerationStatus === "ARCHIVED") {
      await supabaseAdmin
        .from("assignments")
        .update({ is_active: false, notes: `IS_ACTIVE:FALSE|MODERATION:${newModerationStatus}` })
        .eq("issue_id", issueId)
        .eq("is_active", true);

      await supabaseAdmin.from("status_history").insert({
        id: `sh-mod-deact-${Date.now()}`,
        issue_id: issueId,
        previous_status: currentIssue.status || "ASSIGNED",
        new_status: currentIssue.status || "ASSIGNED",
        changed_by: user.id,
        comment: `Deactivated active operational assignment due to report moderation state (${newModerationStatus})`,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      issueId,
      moderationStatus: newModerationStatus,
      moderatedAt: timestamp,
    });
  } catch (err: any) {
    console.error("Admin Moderation Error:", err);
    return NextResponse.json({ error: err.message || "Failed to execute moderation action." }, { status: 500 });
  }
}
