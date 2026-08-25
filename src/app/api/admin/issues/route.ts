import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AssignmentTargetType, CivicIssue } from "@/types/civic";
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

    // Verify MUNICIPAL_ADMIN role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "MUNICIPAL_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only authorized Municipal Administrators can access the master triage queue." }, { status: 403 });
    }

    // Fetch all issues with reports, assignments, and status_history
    const { data: issuesData, error: issuesErr } = await supabaseAdmin
      .from("issues")
      .select(`
        *,
        reports (*),
        assignments (*),
        status_history (*)
      `)
      .order("created_at", { ascending: false });

    if (issuesErr) {
      console.error("Error fetching admin issues:", issuesErr);
      return NextResponse.json({ error: issuesErr.message || "Failed to load issues from database." }, { status: 500 });
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

        const allAsg = Array.isArray(row.assignments) ? row.assignments : (row.assignments ? [row.assignments] : []);
        const asgRow = allAsg
          .filter((a: any) => !a.notes?.startsWith("SUPERSEDED|") && !a.notes?.includes("IS_ACTIVE:FALSE"))
          .sort((a: any, b: any) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0];

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

        // Authoritative extraction of moderation state
        const mod = extractModerationFromHistory(row, row.status_history || []);

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
          moderationStatus: mod.moderationStatus,
          moderationReason: mod.moderationReason,
          moderatedAt: mod.moderatedAt,
          moderatedBy: mod.moderatedBy,
          reportCount: row.report_count || 1,
          reports,
          assignment,
          statusHistory: (row.status_history || []).map((h: any) => ({
            id: h.id,
            issueId: h.issue_id,
            previousStatus: h.previous_status || undefined,
            newStatus: h.new_status,
            changedBy: h.changed_by,
            comment: h.comment || undefined,
            timestamp: h.timestamp,
          })),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
    );

    return NextResponse.json({ success: true, issues, totalCount: issues.length });
  } catch (err: any) {
    console.error("GET /api/admin/issues error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch admin issues." }, { status: 500 });
  }
}
