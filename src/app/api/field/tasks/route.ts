import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AssignmentTargetType, CivicIssue, ResolutionEvidence } from "@/types/civic";

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

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ error: "Forbidden: Only authorized Field Workers can access field operations tasks." }, { status: 403 });
    }

    // 1. Resolve worker's operational team memberships
    const { data: memberships } = await supabaseAdmin
      .from("team_members")
      .select("team_id")
      .eq("worker_id", user.id);

    const workerTeamIds = (memberships || []).map((m: any) => m.team_id).filter(Boolean);

    // 2. Query active assignments for worker's teams or direct individual assignment
    let assignmentsQuery = supabaseAdmin
      .from("assignments")
      .select("*")
      .eq("is_active", true);

    if (profile.role === "FIELD_WORKER") {
      if (workerTeamIds.length > 0) {
        assignmentsQuery = assignmentsQuery.or(`team_id.in.(${workerTeamIds.join(",")}),field_worker_id.eq.${user.id}`);
      } else {
        assignmentsQuery = assignmentsQuery.eq("field_worker_id", user.id);
      }
    }

    const { data: activeAssignments, error: asgErr } = await assignmentsQuery;

    if (asgErr) {
      console.error("Error querying field assignments:", asgErr);
      return NextResponse.json({ error: asgErr.message || "Failed to load worker assignments." }, { status: 500 });
    }

    if (!activeAssignments || activeAssignments.length === 0) {
      return NextResponse.json({ success: true, issues: [], totalCount: 0 });
    }

    const assignedIssueIds = Array.from(new Set(activeAssignments.map((a: any) => a.issue_id).filter(Boolean)));

    if (assignedIssueIds.length === 0) {
      return NextResponse.json({ success: true, issues: [], totalCount: 0 });
    }

    // 3. Fetch matching issues with reports
    const { data: issuesData, error: issuesErr } = await supabaseAdmin
      .from("issues")
      .select(`
        *,
        reports (*)
      `)
      .in("id", assignedIssueIds)
      .order("created_at", { ascending: false });

    if (issuesErr) {
      console.error("Error querying assigned issues:", issuesErr);
      return NextResponse.json({ error: issuesErr.message || "Failed to load assigned issues." }, { status: 500 });
    }

    const issues: CivicIssue[] = await Promise.all(
      (issuesData || []).map(async (row: any) => {
        const reports = await Promise.all(
          (row.reports || []).map(async (r: any) => {
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

        // Map the active assignment
        const asgRow = activeAssignments.find((a: any) => a.issue_id === row.id);

        let targetType: AssignmentTargetType = (asgRow?.target_type as any) || "TEAM";
        let teamId: string | undefined = asgRow?.team_id || undefined;
        if (asgRow?.notes?.includes("TARGET_TYPE:TEAM")) {
          targetType = "TEAM";
          const match = asgRow.notes.match(/TEAM_ID:([^|]+)/);
          if (match) teamId = match[1];
        }

        const assignment = asgRow
          ? {
              id: asgRow.id,
              issueId: asgRow.issue_id,
              departmentId: asgRow.department_id,
              targetType,
              fieldWorkerId: asgRow.field_worker_id || undefined,
              teamId,
              assignedAt: asgRow.assigned_at,
              targetResolutionDate: asgRow.target_resolution_date,
              notes: asgRow.notes || undefined,
              isActive: true,
            }
          : undefined;

        return {
          id: row.id,
          canonicalTitle: row.canonical_title,
          category: row.category,
          status: row.status,
          priorityLevel: row.priority_level,
          priorityScore: row.priority_score,
          wardId: row.ward_id,
          departmentId: row.department_id || undefined,
          latitude: Number(row.latitude) || 0,
          longitude: Number(row.longitude) || 0,
          addressText: row.address_text,
          locationSource: (row.location_source as any) || "MANUAL_MAP_SELECTION",
          locationAccuracy: row.location_accuracy || undefined,
          moderationStatus: row.moderation_status || "ACTIVE",
          moderationReason: row.moderation_reason || undefined,
          moderatedAt: row.moderated_at || undefined,
          moderatedBy: row.moderated_by || undefined,
          reportCount: row.report_count || 1,
          reports,
          assignment,
          statusHistory: [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
    );

    return NextResponse.json({ success: true, issues, totalCount: issues.length });
  } catch (err: any) {
    console.error("GET /api/field/tasks error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch field tasks." }, { status: 500 });
  }
}
