import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AssignmentTargetType, CivicIssue, ResolutionEvidence } from "@/types/civic";
import { extractModerationFromHistory } from "@/lib/moderationHelper";

async function resolveStorageImageUrl(pathOrUrl?: string | null): Promise<string | undefined> {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return undefined;
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("blob:")
  ) {
    return pathOrUrl;
  }

  const cleanPath = pathOrUrl.replace(/^\/+/, "");

  // Canonical bucket: 'civicfix-evidence' (Private bucket)
  try {
    const { data: signed } = await supabaseAdmin.storage
      .from("civicfix-evidence")
      .createSignedUrl(cleanPath, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) return signed.signedUrl;

    const publicUrl = supabaseAdmin.storage.from("civicfix-evidence").getPublicUrl(cleanPath).data.publicUrl;
    if (publicUrl && publicUrl.startsWith("http")) return publicUrl;
  } catch (err) {
    console.warn(`[resolveStorageImageUrl] Signed URL generation failed for ${cleanPath}:`, err);
  }

  return undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const issueId = params.id;
    if (!issueId) {
      return NextResponse.json({ error: "Missing issue ID parameter." }, { status: 400 });
    }

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

    // Fetch target issue row with supabaseAdmin (bypassing RLS anomalies)
    const { data: issueRow, error: issueErr } = await supabaseAdmin
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();

    if (issueErr || !issueRow) {
      return NextResponse.json({ error: "Issue not found in database." }, { status: 404 });
    }

    // Fetch related relational data in parallel
    const [reportsRes, assignmentRes, historyRes, evidenceRes, verificationRes, triageRes] = await Promise.all([
      supabaseAdmin.from("reports").select("*").eq("issue_id", issueId),
      supabaseAdmin.from("assignments").select("*").eq("issue_id", issueId).order("assigned_at", { ascending: false }).limit(1),
      supabaseAdmin.from("status_history").select("*").eq("issue_id", issueId).order("timestamp", { ascending: true }),
      supabaseAdmin.from("resolution_evidence").select("*").eq("issue_id", issueId).order("submitted_at", { ascending: false }).limit(1),
      supabaseAdmin.from("verification_results").select("*").eq("issue_id", issueId).order("verified_at", { ascending: false }).limit(1),
      supabaseAdmin.from("ai_triage_assessments").select("*").eq("issue_id", issueId).maybeSingle(),
    ]);

    const activeAsgRow = assignmentRes.data && assignmentRes.data.length > 0 ? assignmentRes.data[0] : null;

    // Field Worker Team Authorization Enforcement (TEST D)
    if (profile.role === "FIELD_WORKER") {
      if (!activeAsgRow) {
        return NextResponse.json({ error: "Forbidden: Issue is not assigned to field operations." }, { status: 403 });
      }

      if (activeAsgRow.field_worker_id !== user.id) {
        const { data: memberRows } = await supabaseAdmin
          .from("team_members")
          .select("team_id")
          .eq("worker_id", user.id);

        const workerTeams = (memberRows || []).map((m: any) => m.team_id);
        const assignedTeamId = activeAsgRow.team_id || (activeAsgRow.notes?.match(/TEAM_ID:([^|]+)/)?.[1]);

        if (!assignedTeamId || !workerTeams.includes(assignedTeamId)) {
          return NextResponse.json({ error: "Forbidden: You do not belong to the operational team assigned to this issue." }, { status: 403 });
        }
      }
    }

    // Build signed URLs for report images if storage bucket is private
    const reports = await Promise.all(
      (reportsRes.data || []).map(async (r: any) => {
        const displayUrl = await resolveStorageImageUrl(r.image_url);
        return {
          id: r.id,
          issueId: r.issue_id,
          citizenId: r.citizen_id,
          description: r.description,
          imageUrl: displayUrl || undefined,
          latitude: r.latitude,
          longitude: r.longitude,
          wardId: r.ward_id,
          createdAt: r.created_at,
        };
      })
    );

    const latestEvidence = evidenceRes.data && evidenceRes.data.length > 0 ? evidenceRes.data[0] : null;
    let resolutionEvidence: ResolutionEvidence | undefined = undefined;
    if (latestEvidence) {
      const beforeUrl = (await resolveStorageImageUrl(latestEvidence.before_image_url)) || latestEvidence.before_image_url || "";
      const afterUrl = (await resolveStorageImageUrl(latestEvidence.after_image_url)) || latestEvidence.after_image_url || "";
      resolutionEvidence = {
        id: latestEvidence.id,
        issueId: latestEvidence.issue_id,
        fieldWorkerId: latestEvidence.field_worker_id,
        beforeImageUrl: beforeUrl,
        afterImageUrl: afterUrl,
        workSummary: latestEvidence.work_summary,
        submittedAt: latestEvidence.submitted_at,
      };
    }

    const latestVerification = verificationRes.data && verificationRes.data.length > 0 ? verificationRes.data[0] : null;
    const verificationResult = latestVerification
      ? {
          id: latestVerification.id,
          issueId: latestVerification.issue_id,
          aiConfidenceScore: latestVerification.ai_confidence_score,
          aiMatchDetected: latestVerification.ai_match_detected,
          aiExplanation: latestVerification.ai_explanation,
          verifiedAt: latestVerification.verified_at,
        }
      : undefined;

    const mod = extractModerationFromHistory(issueRow, historyRes.data || []);

    const issue: CivicIssue = {
      id: issueRow.id,
      canonicalTitle: issueRow.canonical_title,
      category: issueRow.category,
      status: issueRow.status,
      priorityLevel: issueRow.priority_level,
      priorityScore: issueRow.priority_score,
      wardId: issueRow.ward_id,
      departmentId: issueRow.department_id || undefined,
      latitude: Number(issueRow.latitude) || 0,
      longitude: Number(issueRow.longitude) || 0,
      addressText: issueRow.address_text,
      locationSource: (issueRow.location_source as any) || "MANUAL_MAP_SELECTION",
      locationAccuracy: issueRow.location_accuracy || undefined,
      moderationStatus: mod.moderationStatus,
      moderationReason: mod.moderationReason,
      moderatedAt: mod.moderatedAt,
      moderatedBy: mod.moderatedBy,
      reportCount: issueRow.report_count || 1,
      reports,
      assignment: activeAsgRow
        ? (() => {
            let targetType: AssignmentTargetType = (activeAsgRow.target_type as any) || "TEAM";
            let teamId: string | undefined = activeAsgRow.team_id || undefined;
            if (activeAsgRow.notes?.includes("TARGET_TYPE:TEAM")) {
              targetType = "TEAM";
              const match = activeAsgRow.notes.match(/TEAM_ID:([^|]+)/);
              if (match) teamId = match[1];
            }
            const isActive = !activeAsgRow.notes?.startsWith("SUPERSEDED|") && !activeAsgRow.notes?.includes("IS_ACTIVE:FALSE");
            return {
              id: activeAsgRow.id,
              issueId: activeAsgRow.issue_id,
              departmentId: activeAsgRow.department_id,
              targetType,
              fieldWorkerId: activeAsgRow.field_worker_id || undefined,
              teamId,
              assignedAt: activeAsgRow.assigned_at,
              targetResolutionDate: activeAsgRow.target_resolution_date,
              notes: activeAsgRow.notes || undefined,
              isActive,
            };
          })()
        : undefined,
      statusHistory: (historyRes.data || []).map((h: any) => ({
        id: h.id,
        issueId: h.issue_id,
        previousStatus: h.previous_status || undefined,
        newStatus: h.new_status,
        changedBy: h.changed_by,
        comment: h.comment || undefined,
        timestamp: h.timestamp,
      })),
      resolutionEvidence,
      verificationResult,
      aiAssessment: triageRes.data
        ? {
            id: triageRes.data.id,
            issueId: triageRes.data.issue_id,
            category: triageRes.data.category as any,
            severity: triageRes.data.severity as any,
            urgency: triageRes.data.urgency as any,
            impact: triageRes.data.impact as any,
            priorityScore: triageRes.data.priority_score,
            priorityLevel: triageRes.data.priority_level as any,
            reasoning: triageRes.data.reasoning,
            recommendedDepartment: triageRes.data.recommended_department,
            workSummary: triageRes.data.work_summary,
            isCivicIssue: triageRes.data.is_civic_issue ?? true,
            hazardClassification: triageRes.data.hazard_classification || "Standard Risk",
            confidenceScore: triageRes.data.confidence_score ?? 1.0,
            inJurisdiction: triageRes.data.in_jurisdiction ?? true,
            model: triageRes.data.model || undefined,
            provider: triageRes.data.provider || undefined,
            createdAt: triageRes.data.created_at,
            updatedAt: triageRes.data.updated_at,
          }
        : undefined,
      createdAt: issueRow.created_at,
      updatedAt: issueRow.updated_at,
    };

    return NextResponse.json({ success: true, issue });
  } catch (err: any) {
    console.error("GET /api/admin/issues/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch issue." }, { status: 500 });
  }
}
