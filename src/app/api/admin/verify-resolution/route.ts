import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized: Missing authentication token." }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized: Invalid or expired session token." }, { status: 401 });
    }

    // Role verification: Only MUNICIPAL_ADMIN can verify resolution evidence
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (profErr || !profile || profile.role !== "MUNICIPAL_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only Municipal Administrators can verify resolution evidence and make resolution decisions." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { issueId, decision, reason, notes } = body;
    const adminNotes = (reason || notes || "").trim();

    if (!issueId) {
      return NextResponse.json({ error: "Missing required field: issueId." }, { status: 400 });
    }

    const isApprove = decision === "VERIFIED" || decision === "APPROVED";
    const isRework = decision === "FAILED" || decision === "REWORK_REQUIRED";

    if (!isApprove && !isRework) {
      return NextResponse.json(
        { error: "Invalid decision. Must be 'VERIFIED'/'APPROVED' or 'FAILED'/'REWORK_REQUIRED'." },
        { status: 400 }
      );
    }

    if (isRework && !adminNotes) {
      return NextResponse.json(
        { error: "A mandatory verification failure reason is required when requesting rework from the field crew." },
        { status: 400 }
      );
    }

    // Fetch existing issue
    const { data: issueRow, error: issueErr } = await supabaseAdmin
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();

    if (issueErr || !issueRow) {
      return NextResponse.json({ error: "Issue not found in database." }, { status: 404 });
    }

    const timestamp = new Date().toISOString();

    // ---------------------------------------------------------------------------
    // DECISION: VERIFIED / APPROVED -> RESOLVED
    // ---------------------------------------------------------------------------
    if (isApprove) {
      // Idempotency check: If already RESOLVED, return current state without duplicate status_history
      if (issueRow.status === "RESOLVED") {
        return NextResponse.json({
          success: true,
          decision: "APPROVED",
          status: "RESOLVED",
          message: "Issue is already marked as RESOLVED.",
        });
      }

      if (issueRow.status !== "VERIFICATION") {
        return NextResponse.json(
          { error: `Cannot approve verification: Issue is currently in '${issueRow.status}' status (must be in 'VERIFICATION').` },
          { status: 400 }
        );
      }

      // Fetch latest AI verification confidence score if available
      const { data: latestVer } = await supabaseAdmin
        .from("verification_results")
        .select("*")
        .eq("issue_id", issueId)
        .order("verified_at", { ascending: false })
        .limit(1);

      const aiConfidenceText = latestVer?.[0]?.ai_confidence_score
        ? ` AI confidence: ${Math.round(latestVer[0].ai_confidence_score * 100)}%.`
        : "";

      // Update issue status to RESOLVED
      const { error: updateErr } = await supabaseAdmin
        .from("issues")
        .update({
          status: "RESOLVED",
          updated_at: timestamp,
        })
        .eq("id", issueId);

      if (updateErr) {
        throw new Error(`Failed to update issue status: ${updateErr.message}`);
      }

      // Create status_history audit record
      const comment = adminNotes
        ? `ADMIN VERIFICATION APPROVED: Resolution evidence reviewed and verified.${aiConfidenceText} Notes: ${adminNotes}`
        : `ADMIN VERIFICATION APPROVED: Resolution evidence reviewed and verified.${aiConfidenceText}`;

      await supabaseAdmin.from("status_history").insert({
        id: `sh-ver-${Date.now()}`,
        issue_id: issueId,
        previous_status: "VERIFICATION",
        new_status: "RESOLVED",
        changed_by: user.id,
        comment,
        timestamp,
      });

      return NextResponse.json({
        success: true,
        decision: "APPROVED",
        status: "RESOLVED",
        message: "Resolution verified and marked as RESOLVED.",
      });
    }

    // ---------------------------------------------------------------------------
    // DECISION: FAILED / REWORK_REQUIRED -> IN_PROGRESS
    // ---------------------------------------------------------------------------
    if (isRework) {
      // Idempotency check: If already IN_PROGRESS with rework comment
      if (issueRow.status === "IN_PROGRESS") {
        const { data: latestHist } = await supabaseAdmin
          .from("status_history")
          .select("comment")
          .eq("issue_id", issueId)
          .order("timestamp", { ascending: false })
          .limit(1);

        if (latestHist?.[0]?.comment?.startsWith("ADMIN VERIFICATION FAILED:") || latestHist?.[0]?.comment?.startsWith("ADMIN VERIFICATION NOT APPROVED - REWORK REQUIRED:")) {
          return NextResponse.json({
            success: true,
            decision: "REWORK_REQUIRED",
            status: "IN_PROGRESS",
            message: "Task is already sent back for rework.",
          });
        }
      }

      if (issueRow.status !== "VERIFICATION") {
        return NextResponse.json(
          { error: `Cannot request rework: Issue is currently in '${issueRow.status}' status (must be in 'VERIFICATION').` },
          { status: 400 }
        );
      }

      // Update issue status back to IN_PROGRESS
      const { error: updateErr } = await supabaseAdmin
        .from("issues")
        .update({
          status: "IN_PROGRESS",
          updated_at: timestamp,
        })
        .eq("id", issueId);

      if (updateErr) {
        throw new Error(`Failed to update issue status: ${updateErr.message}`);
      }

      // Create status_history audit record for rework
      const comment = `ADMIN VERIFICATION FAILED: Returned to field team for rework. Reason: ${adminNotes}`;

      await supabaseAdmin.from("status_history").insert({
        id: `sh-rework-${Date.now()}`,
        issue_id: issueId,
        previous_status: "VERIFICATION",
        new_status: "IN_PROGRESS",
        changed_by: user.id,
        comment,
        timestamp,
      });

      return NextResponse.json({
        success: true,
        decision: "REWORK_REQUIRED",
        status: "IN_PROGRESS",
        message: "Resolution returned to operational crew for rework.",
      });
    }
  } catch (err: any) {
    console.error("verify-resolution API error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error during resolution verification." },
      { status: 500 }
    );
  }
}
