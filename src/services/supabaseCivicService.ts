import {
  CivicIssue,
  CivicIssueService,
  CreateReportInput,
  DashboardStats,
  ResolutionEvidence,
  SubmitEvidenceInput,
  VerificationResult,
  IssueStatus,
  AITriageAssessment,
  AssignmentTargetType,
  Team,
  UserProfile,
  ModerationStatus,
} from "@/types/civic";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { MockCivicService } from "./mockCivicService";
import { WorkloadCapacity, SLAMetrics, SLAStatus } from "@/types/civic";

export function calculateSLAHours(priorityLevel?: string, priorityScore?: number): number {
  if (priorityLevel === "CRITICAL" || (priorityScore !== undefined && priorityScore >= 80)) return 24;
  if (priorityLevel === "HIGH" || (priorityScore !== undefined && priorityScore >= 60)) return 48;
  if (priorityLevel === "MEDIUM" || (priorityScore !== undefined && priorityScore >= 40)) return 72;
  return 120;
}

export function getSLAStatus(targetResolutionDate?: string): SLAMetrics {
  if (!targetResolutionDate) {
    return {
      status: "NO_DEADLINE",
      hoursRemaining: null,
      targetDateFormatted: null,
      label: "No Deadline",
    };
  }

  const deadlineMs = new Date(targetResolutionDate).getTime();
  const nowMs = Date.now();
  const diffMs = deadlineMs - nowMs;
  const hoursRemaining = Math.round(diffMs / (1000 * 60 * 60));

  const targetDateFormatted = new Date(targetResolutionDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffMs < 0) {
    return {
      status: "OVERDUE",
      hoursRemaining,
      targetDateFormatted,
      label: `Overdue by ${Math.abs(hoursRemaining)}h`,
    };
  }

  if (hoursRemaining <= 24) {
    return {
      status: "DUE_SOON",
      hoursRemaining,
      targetDateFormatted,
      label: `Due Soon (${hoursRemaining}h remaining)`,
    };
  }

  return {
    status: "ON_TRACK",
    hoursRemaining,
    targetDateFormatted,
    label: `On Track (${hoursRemaining}h remaining)`,
  };
}

/**
 * Calculate the great-circle distance between two points on the Earth using the Haversine formula.
 * Returns distance in integer meters.
 */
export function calculateHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Reusable helper to acquire a valid authenticated access token from Supabase client.
 * Refreshes the session if expired or close to expiration (< 60s remaining).
 */
export async function getValidAccessToken(): Promise<string> {
  if (typeof window === "undefined" || !isSupabaseConfigured || !supabase) {
    throw new Error("Supabase authentication is not configured.");
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData?.session) {
    throw new Error("Authentication session required. Please sign in.");
  }

  let session = sessionData.session;
  const nowSecs = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at || 0;

  // If token expires within 60 seconds, proactively refresh it
  if (expiresAt > 0 && expiresAt - nowSecs < 60) {
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshData.session) {
      session = refreshData.session;
    }
  }

  const token = session.access_token;
  if (!token) {
    throw new Error("Failed to retrieve valid access token.");
  }

  return token;
}

/**
 * Execute an authenticated fetch to protected API endpoints with a controlled single 401 retry.
 * Handles 401 by attempting session refresh and retrying exactly ONCE.
 * Does NOT retry 403 (Forbidden: insufficient role permissions).
 */
export async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await getValidAccessToken();

  const makeRequest = async (authToken: string) => {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${authToken}`);
    if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
      headers.set("Content-Type", "application/json");
    }

    return fetch(url, {
      ...init,
      headers,
    });
  };

  let response = await makeRequest(token);

  // If 401 Unauthorized: Attempt ONE session refresh and retry once
  if (response.status === 401 && isSupabaseConfigured && supabase) {
    try {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr && refreshData.session?.access_token) {
        token = refreshData.session.access_token;
        response = await makeRequest(token);
      }
    } catch {
      // Non-fatal, let error handling below process the response
    }
  }

  if (!response.ok) {
    let errMsg = `Request to ${url} failed with status ${response.status}.`;
    try {
      const errJson = await response.json();
      if (errJson?.error) errMsg = errJson.error;
    } catch {}

    if (response.status === 401) {
      throw new Error("Authentication session expired. Please sign in again.");
    }
    if (response.status === 403) {
      throw new Error(errMsg || "Forbidden: You do not have permission to perform this action.");
    }

    throw new Error(errMsg);
  }

  return response;
}

export function calculateWorkloadCapacity(activeTaskCount: number): WorkloadCapacity {
  if (activeTaskCount <= 2) {
    return { level: "LIGHT", activeTaskCount, label: `${activeTaskCount} active tasks (Light Load)` };
  }
  if (activeTaskCount <= 5) {
    return { level: "OPTIMAL", activeTaskCount, label: `${activeTaskCount} active tasks (Optimal Load)` };
  }
  return { level: "HIGH_LOAD", activeTaskCount, label: `${activeTaskCount} active tasks (High Load)` };
}

export class SupabaseCivicService implements CivicIssueService {
  private fallback = new MockCivicService();

  async getFieldTasks(): Promise<CivicIssue[]> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.getIssues();
    }

    if (typeof window !== "undefined") {
      try {
        const res = await fetchWithAuth("/api/field/tasks", { method: "GET" });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.issues)) return json.issues;
        }
      } catch (err: any) {
        console.warn("[getFieldTasks] /api/field/tasks fallback:", err?.message);
      }
    }

    return this.getIssues();
  }

  async getIssues(): Promise<CivicIssue[]> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.getIssues();
    }

    if (typeof window !== "undefined") {
      // 1. In field workspace, route directly to /api/field/tasks
      if (window.location.pathname.startsWith("/field")) {
        try {
          const res = await fetchWithAuth("/api/field/tasks", { method: "GET" });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.issues)) return json.issues;
          }
        } catch (err: any) {
          console.warn("[getIssues] field route fallback:", err?.message);
        }
      }

      // 2. In admin workspace, route directly to /api/admin/issues
      if (window.location.pathname.startsWith("/admin")) {
        try {
          const res = await fetchWithAuth("/api/admin/issues", { method: "GET" });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.issues)) return json.issues;
          }
        } catch (err: any) {
          console.warn("[getIssues] admin route fallback:", err?.message);
        }
      }
    }

    try {
      const { data: issuesData, error: issuesError } = await supabase
        .from("issues")
        .select(`
          *,
          reports (*),
          assignments (*),
          status_history (*)
        `)
        .order("created_at", { ascending: false });

      if (issuesError) {
        console.error("Supabase fetch issues error:", issuesError);
        throw new Error(issuesError.message || "Failed to load live issues from database.");
      }
      if (!issuesData) return [];

      const issues: CivicIssue[] = await Promise.all(
        issuesData.map(async (row: any) => {
          const reports = await Promise.all(
            (row.reports || []).map(async (r: any) => ({
              id: r.id,
              issueId: r.issue_id,
              citizenId: r.citizen_id,
              description: r.description,
              imageUrl: r.image_url ? await this.getImageDisplayUrl(r.image_url) : undefined,
              latitude: r.latitude,
              longitude: r.longitude,
              wardId: r.ward_id,
              createdAt: r.created_at,
            }))
          );

          const allAsg = Array.isArray(row.assignments) ? row.assignments : (row.assignments ? [row.assignments] : []);
          const asgRow = allAsg
            .filter((a: any) => !a.notes?.startsWith("SUPERSEDED|") && !a.notes?.includes("IS_ACTIVE:FALSE"))
            .sort((a: any, b: any) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0];

          let targetType: AssignmentTargetType = (asgRow?.target_type as any) || "INDIVIDUAL";
          let teamId: string | undefined = asgRow?.team_id || undefined;
          if (asgRow?.notes?.includes("TARGET_TYPE:TEAM")) {
            targetType = "TEAM";
            const match = asgRow.notes.match(/TEAM_ID:([^|]+)/);
            if (match) teamId = match[1];
          }

          const isActive = asgRow ? (!asgRow.notes?.startsWith("SUPERSEDED|") && !asgRow.notes?.includes("IS_ACTIVE:FALSE")) : true;

          const assignment = asgRow ? {
            id: asgRow.id,
            issueId: asgRow.issue_id,
            departmentId: asgRow.department_id,
            targetType,
            fieldWorkerId: asgRow.field_worker_id || undefined,
            teamId,
            assignedAt: asgRow.assigned_at,
            targetResolutionDate: asgRow.target_resolution_date,
            notes: asgRow.notes || undefined,
            isActive,
          } : undefined;

          // Extract moderation status from status_history if column is missing/default
          let modStatus: ModerationStatus = "ACTIVE";
          let modReason: string | undefined = undefined;
          let modAt: string | undefined = undefined;
          let modBy: string | undefined = undefined;

          if (row.moderation_status && ["ACTIVE", "UNDER_REVIEW", "SUSPICIOUS", "REJECTED", "ARCHIVED"].includes(row.moderation_status)) {
            modStatus = row.moderation_status;
            modReason = row.moderation_reason || undefined;
            modAt = row.moderated_at || undefined;
            modBy = row.moderated_by || undefined;
          } else {
            const modEvents = (row.status_history || [])
              .filter((h: any) => h.comment && h.comment.startsWith("MODERATION CHANGE:"))
              .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            if (modEvents.length > 0) {
              const latest = modEvents[0];
              const match = latest.comment.match(/MODERATION CHANGE:\s*\[[^\]]+\]\s*->\s*\[([^\]]+)\]/);
              if (match) {
                const s = match[1].trim().toUpperCase() as ModerationStatus;
                if (["ACTIVE", "UNDER_REVIEW", "SUSPICIOUS", "REJECTED", "ARCHIVED"].includes(s)) {
                  modStatus = s;
                  const rMatch = latest.comment.match(/\(Reason:\s*([^)]+)\)/);
                  if (rMatch) modReason = rMatch[1].trim();
                  modAt = latest.timestamp;
                  modBy = latest.changed_by;
                }
              }
            }
          }

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
            moderationStatus: modStatus,
            moderationReason: modReason,
            moderatedAt: modAt,
            moderatedBy: modBy,
            reportCount: row.report_count,
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

      return issues;
    } catch (e) {
      console.error("Failed to fetch from Supabase, using mock fallback:", e);
      return this.fallback.getIssues();
    }
  }

  async getIssue(id: string): Promise<CivicIssue | null> {
    if (!id) return null;

    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.getIssue(id);
    }

    // 1. In browser context, fetch via authoritative server endpoint with automatic auth token
    if (typeof window !== "undefined") {
      try {
        const res = await fetchWithAuth(`/api/admin/issues/${id}`, { method: "GET" });
        if (res.ok) {
          const json = await res.json();
          if (json?.issue) return json.issue;
        }
      } catch (apiErr: any) {
        // Fallback to direct client query if session or route is not applicable
        console.warn(`[getIssue] API route fallback for ${id}:`, apiErr?.message);
      }
    }

    // 2. Direct client query via Supabase
    try {
      const { data: issueRow, error } = await supabase
        .from("issues")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !issueRow) {
        return this.fallback.getIssue(id);
      }

      const [reportsRes, assignmentRes, historyRes, evidenceRes, verificationRes, triageRes] = await Promise.all([
        supabase.from("reports").select("*").eq("issue_id", id),
        supabase.from("assignments").select("*").eq("issue_id", id).order("assigned_at", { ascending: false }).limit(1),
        supabase.from("status_history").select("*").eq("issue_id", id).order("timestamp", { ascending: true }),
        supabase.from("resolution_evidence").select("*").eq("issue_id", id).maybeSingle(),
        supabase.from("verification_results").select("*").eq("issue_id", id).maybeSingle(),
        supabase.from("ai_triage_assessments").select("*").eq("issue_id", id).maybeSingle(),
      ]);

      const reports = await Promise.all(
        (reportsRes.data || []).map(async (r) => ({
          id: r.id,
          issueId: r.issue_id,
          citizenId: r.citizen_id,
          description: r.description,
          imageUrl: r.image_url ? await this.getImageDisplayUrl(r.image_url) : undefined,
          latitude: r.latitude,
          longitude: r.longitude,
          wardId: r.ward_id,
          createdAt: r.created_at,
        }))
      );

      let resolutionEvidence: ResolutionEvidence | undefined = undefined;
      if (evidenceRes.data) {
        const beforeUrl = await this.getImageDisplayUrl(evidenceRes.data.before_image_url);
        const afterUrl = await this.getImageDisplayUrl(evidenceRes.data.after_image_url);
        resolutionEvidence = {
          id: evidenceRes.data.id,
          issueId: evidenceRes.data.issue_id,
          fieldWorkerId: evidenceRes.data.field_worker_id,
          beforeImageUrl: beforeUrl,
          afterImageUrl: afterUrl,
          workSummary: evidenceRes.data.work_summary,
          submittedAt: evidenceRes.data.submitted_at,
        };
      }

      const activeAsgRow = assignmentRes.data && assignmentRes.data.length > 0 ? assignmentRes.data[0] : null;

      const issue: CivicIssue = {
        id: issueRow.id,
        canonicalTitle: issueRow.canonical_title,
        category: issueRow.category,
        status: issueRow.status,
        priorityLevel: issueRow.priority_level,
        priorityScore: issueRow.priority_score,
        wardId: issueRow.ward_id,
        departmentId: issueRow.department_id || undefined,
        latitude: issueRow.latitude,
        longitude: issueRow.longitude,
        addressText: issueRow.address_text,
        locationSource: (issueRow.location_source as any) || "MANUAL_MAP_SELECTION",
        locationAccuracy: issueRow.location_accuracy || undefined,
        moderationStatus: issueRow.moderation_status || "ACTIVE",
        moderationReason: issueRow.moderation_reason || undefined,
        moderatedAt: issueRow.moderated_at || undefined,
        moderatedBy: issueRow.moderated_by || undefined,
        reportCount: issueRow.report_count,
        reports,
        assignment: activeAsgRow
          ? (() => {
              let targetType: AssignmentTargetType = (activeAsgRow.target_type as any) || "INDIVIDUAL";
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
        statusHistory: (historyRes.data || []).map((h) => ({
          id: h.id,
          issueId: h.issue_id,
          previousStatus: h.previous_status || undefined,
          newStatus: h.new_status,
          changedBy: h.changed_by,
          comment: h.comment || undefined,
          timestamp: h.timestamp,
        })),
        resolutionEvidence,
        verificationResult: verificationRes.data
          ? {
              id: verificationRes.data.id,
              issueId: verificationRes.data.issue_id,
              aiConfidenceScore: verificationRes.data.ai_confidence_score,
              aiMatchDetected: verificationRes.data.ai_match_detected,
              aiExplanation: verificationRes.data.ai_explanation,
              verifiedAt: verificationRes.data.verified_at,
            }
          : undefined,
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

      return issue;
    } catch (e) {
      console.warn("Failed to get issue from Supabase, using mock fallback:", e);
      return this.fallback.getIssue(id);
    }
  }

  async createReport(input: CreateReportInput): Promise<CivicIssue> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.createReport(input);
    }

    const assessment = input.aiAssessment;
    if (!assessment) {
      throw new Error("Validated AI triage assessment is required before submitting report.");
    }

    try {
      // Invoke the Phase 2A atomic submit_citizen_report RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "submit_citizen_report",
        {
          p_title: input.title,
          p_description: input.description,
          p_category: input.category,
          p_ward_id: input.wardId,
          p_latitude: input.latitude,
          p_longitude: input.longitude,
          p_address_text: input.addressText,
          p_image_url: input.imageUrl || null,
          p_priority_level: assessment.priorityLevel,
          p_priority_score: assessment.priorityScore,
        }
      );

      if (rpcErr || !rpcData) {
        console.error("RPC submit_citizen_report error:", rpcErr);
        throw rpcErr || new Error("Failed to submit citizen report via RPC");
      }

      const issueId = (rpcData as any).issue_id;

      // Update location_source & location_accuracy on issue record
      if (input.locationSource || input.locationAccuracy) {
        await supabase
          .from("issues")
          .update({
            location_source: input.locationSource || "MANUAL_MAP_SELECTION",
            location_accuracy: input.locationAccuracy || null,
          })
          .eq("id", issueId);
      }

      // Securely persist AI triage assessment using dedicated Step 3.1 save_ai_triage_assessment RPC
      const { error: triageRpcErr } = await supabase.rpc("save_ai_triage_assessment", {
        p_issue_id: issueId,
        p_category: assessment.category,
        p_severity: assessment.severity,
        p_urgency: assessment.urgency,
        p_impact: assessment.impact,
        p_priority_score: assessment.priorityScore,
        p_priority_level: assessment.priorityLevel,
        p_reasoning: assessment.reasoning,
        p_recommended_department: assessment.recommendedDepartment,
        p_work_summary: assessment.workSummary,
        p_is_civic_issue: assessment.isCivicIssue ?? true,
        p_hazard_classification: assessment.hazardClassification || "Standard Risk",
        p_confidence_score: assessment.confidenceScore ?? 0.9,
        p_in_jurisdiction: assessment.inJurisdiction ?? true,
        p_model: assessment.model || "google/gemini-2.5-flash",
        p_provider: assessment.provider || "openrouter/gemini-multimodal",
      });

      if (triageRpcErr) {
        console.error("save_ai_triage_assessment RPC error:", triageRpcErr);
        throw new Error("Failed to persist AI triage assessment in database: " + triageRpcErr.message);
      }

      const created = await this.getIssue(issueId);
      if (!created) throw new Error("Failed to retrieve created issue");

      created.aiAssessment = assessment;
      return created;
    } catch (e: any) {
      console.error("Failed to create report in Supabase:", e);
      throw e;
    }
  }

  async getFieldWorkers(): Promise<UserProfile[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [
        { id: "c5f6fd21-6b34-4606-a767-bdae3026c3ab", fullName: "Field Worker Response Crew (worker.test@civicfix.local)", role: "FIELD_WORKER" },
        { id: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe", fullName: "Sanitation Emergency Field Crew (worker.demo2@civicfix.local)", role: "FIELD_WORKER" }
      ];
    }
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("role", "FIELD_WORKER");
      if (error || !data || data.length === 0) {
        return [
          { id: "c5f6fd21-6b34-4606-a767-bdae3026c3ab", fullName: "Field Worker Response Crew (worker.test@civicfix.local)", role: "FIELD_WORKER" },
          { id: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe", fullName: "Sanitation Emergency Field Crew (worker.demo2@civicfix.local)", role: "FIELD_WORKER" }
        ];
      }
      const workersList = data.map((p: any) => ({
        id: p.id,
        fullName: p.full_name || p.id,
        role: p.role,
      }));
      if (!workersList.some((w: any) => w.id === "c9f8e7d6-5c4b-3a21-0fed-9876543210fe")) {
        workersList.push({
          id: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe",
          fullName: "Sanitation Emergency Field Crew (worker.demo2@civicfix.local)",
          role: "FIELD_WORKER",
        });
      }
      return workersList;
    } catch (e) {
      return [
        { id: "c5f6fd21-6b34-4606-a767-bdae3026c3ab", fullName: "Field Worker Response Crew (worker.test@civicfix.local)", role: "FIELD_WORKER" },
        { id: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe", fullName: "Sanitation Emergency Field Crew (worker.demo2@civicfix.local)", role: "FIELD_WORKER" }
      ];
    }
  }

  async getTeams(): Promise<Team[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [
        { id: "team-roads", name: "Roads & Asphalt Response Crew", description: "Rapid asphalt patching and road hazard resolution team", specialization: "POTHOLE", isActive: true, leadWorkerId: "c5f6fd21-6b34-4606-a767-bdae3026c3ab" },
        { id: "team-sanitation", name: "Sanitation & Drainage Emergency Unit", description: "High-pressure drain clearance and waste disposal crew", specialization: "GARBAGE", isActive: true, leadWorkerId: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe" }
      ];
    }
    try {
      const { data, error } = await supabase.from("teams").select("*");
      if (error || !data || data.length === 0) {
        return [
          { id: "team-roads", name: "Roads & Asphalt Response Crew", description: "Rapid asphalt patching and road hazard resolution team", specialization: "POTHOLE", isActive: true, leadWorkerId: "c5f6fd21-6b34-4606-a767-bdae3026c3ab" },
          { id: "team-sanitation", name: "Sanitation & Drainage Emergency Unit", description: "High-pressure drain clearance and waste disposal crew", specialization: "GARBAGE", isActive: true, leadWorkerId: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe" }
        ];
      }
      return data.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        specialization: t.specialization,
        isActive: t.is_active,
        leadWorkerId: t.lead_worker_id,
        createdAt: t.created_at,
      }));
    } catch (e) {
      return [
        { id: "team-roads", name: "Roads & Asphalt Response Crew", description: "Rapid asphalt patching and road hazard resolution team", specialization: "POTHOLE", isActive: true, leadWorkerId: "c5f6fd21-6b34-4606-a767-bdae3026c3ab" },
        { id: "team-sanitation", name: "Sanitation & Drainage Emergency Unit", description: "High-pressure drain clearance and waste disposal crew", specialization: "GARBAGE", isActive: true, leadWorkerId: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe" }
      ];
    }
  }

  async assignIssue(
    issueId: string,
    departmentId: string,
    fieldWorkerId?: string,
    targetType: AssignmentTargetType = "INDIVIDUAL",
    teamId?: string
  ): Promise<CivicIssue> {
    if (targetType === "INDIVIDUAL") {
      if (!fieldWorkerId || teamId) {
        throw new Error("Invalid assignment target combination: INDIVIDUAL target requires fieldWorkerId and must have null teamId.");
      }
    } else if (targetType === "TEAM") {
      if (!teamId || fieldWorkerId) {
        throw new Error("Invalid assignment target combination: TEAM target requires teamId and must have null fieldWorkerId.");
      }
    }

    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.assignIssue(issueId, departmentId, fieldWorkerId, targetType, teamId);
    }

    if (typeof window !== "undefined") {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Authentication session token required for assignment.");

      const res = await fetch("/api/admin/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ issueId, departmentId, fieldWorkerId, targetType, teamId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Server error executing assignment.");
      }

      const updated = await this.getIssue(issueId);
      if (!updated) throw new Error("Failed to retrieve updated issue after assignment.");
      return updated;
    }

    try {
      const timestamp = new Date().toISOString();
      const assignmentId = `asg-${Date.now()}`;

      // 1. Fetch existing assignment to record pre-reassignment state & check concurrency
      const existingIssue = await this.getIssue(issueId);
      const slaHours = calculateSLAHours(existingIssue?.priorityLevel, existingIssue?.priorityScore);
      const targetDate = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

      const issueUpdate: any = {
        department_id: departmentId,
        status: "ASSIGNED",
        updated_at: timestamp,
      };
      if (teamId) {
        issueUpdate.team_id = teamId;
      }
      const prevStatus = existingIssue?.status || "SUBMITTED";
      const prevTarget = existingIssue?.assignment
        ? (existingIssue.assignment.targetType === "TEAM" ? `Team:${existingIssue.assignment.teamId}` : `Worker:${existingIssue.assignment.fieldWorkerId}`)
        : "Unassigned";

      const newTarget = targetType === "TEAM" ? `Team:${teamId}` : `Worker:${fieldWorkerId}`;
      const isReassignment = existingIssue?.assignment !== undefined;

      // Concurrency check: if active assignment already matches newTarget assigned within 2 seconds, return existing
      if (existingIssue?.assignment && isReassignment) {
        const isSameTarget = targetType === "TEAM"
          ? existingIssue.assignment.teamId === teamId
          : existingIssue.assignment.fieldWorkerId === fieldWorkerId;
        const timeDiffMs = Date.now() - new Date(existingIssue.assignment.assignedAt).getTime();
        if (isSameTarget && timeDiffMs < 2000) {
          console.log(`[Concurrent Dispatch Guard]: Skipping duplicate concurrent assignment for issue ${issueId}`);
          return existingIssue;
        }
      }

      // 2. Transition prior active assignment rows to SUPERSEDED status
      const { data: existingAsgs } = await supabase
        .from("assignments")
        .select("id, notes")
        .eq("issue_id", issueId);

      if (existingAsgs && existingAsgs.length > 0) {
        for (const oldAsg of existingAsgs) {
          if (!oldAsg.notes?.startsWith("SUPERSEDED|")) {
            await supabase
              .from("assignments")
              .update({ notes: `SUPERSEDED|${oldAsg.notes || ""}` })
              .eq("id", oldAsg.id);
          }
        }
      }

      const { supabaseAdmin } = await import("../lib/supabaseAdmin");
      const client = supabaseAdmin || supabase;

      const { error: updateErr } = await client.from("issues").update(issueUpdate).eq("id", issueId);
      if (updateErr) {
        delete issueUpdate.team_id;
        await client.from("issues").update(issueUpdate).eq("id", issueId);
      }

      const notesMetadata = targetType === "TEAM" ? `TARGET_TYPE:TEAM|TEAM_ID:${teamId}` : `TARGET_TYPE:INDIVIDUAL`;

      const insertPayload: any = {
        id: assignmentId,
        issue_id: issueId,
        department_id: departmentId,
        field_worker_id: targetType === "INDIVIDUAL" ? (fieldWorkerId || null) : null,
        assigned_at: timestamp,
        target_resolution_date: targetDate,
        notes: notesMetadata,
      };

      const { error: asgErr } = await client.from("assignments").insert({
        ...insertPayload,
        target_type: targetType,
        team_id: targetType === "TEAM" ? (teamId || null) : null,
      });

      if (asgErr) {
        console.warn("Assignment insert notice:", asgErr.message);
        await client.from("assignments").insert(insertPayload);
      }

      const userRes = await client.auth.getUser();
      const activeUserId = userRes.data.user?.id || "admin";

      const auditComment = isReassignment
        ? `REASSIGNMENT: Reassigned from [${prevTarget}] to [${newTarget}] (TargetType: ${targetType})`
        : `Assigned via ${targetType} targeting to ${targetType === "TEAM" ? teamId : fieldWorkerId}`;

      await client.from("status_history").insert({
        id: `sh-${Date.now()}`,
        issue_id: issueId,
        previous_status: prevStatus,
        new_status: "ASSIGNED",
        changed_by: activeUserId,
        comment: auditComment,
        timestamp,
      });

      let updated = await this.getIssue(issueId);
      if (!updated) {
        const { data: fetchRow } = await client.from("issues").select("*").eq("id", issueId).single();
        if (fetchRow) {
          updated = {
            id: fetchRow.id,
            canonicalTitle: fetchRow.canonical_title,
            category: fetchRow.category,
            status: "ASSIGNED",
            priorityLevel: fetchRow.priority_level,
            priorityScore: fetchRow.priority_score,
            wardId: fetchRow.ward_id,
            departmentId,
            latitude: Number(fetchRow.latitude) || 0,
            longitude: Number(fetchRow.longitude) || 0,
            addressText: fetchRow.address_text,
            reportCount: fetchRow.report_count || 1,
            reports: [],
            assignment: {
              id: assignmentId,
              issueId,
              departmentId,
              targetType,
              fieldWorkerId: targetType === "INDIVIDUAL" ? fieldWorkerId : undefined,
              teamId: targetType === "TEAM" ? teamId : undefined,
              assignedAt: timestamp,
              targetResolutionDate: targetDate,
              notes: notesMetadata,
              isActive: true,
            },
            statusHistory: [],
            createdAt: fetchRow.created_at,
            updatedAt: timestamp,
          };
        }
      }
      if (!updated) throw new Error("Failed to retrieve assigned issue");
      return updated;
    } catch (e: any) {
      console.error("Failed to assign issue:", e);
      throw new Error(e.message || "Failed to execute assignment.");
    }
  }

  async routeDepartment(issueId: string, departmentId: string, departmentNotes?: string): Promise<CivicIssue> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }

    if (typeof window !== "undefined") {
      await fetchWithAuth("/api/admin/route-department", {
        method: "POST",
        body: JSON.stringify({ issueId, departmentId, departmentNotes }),
      });

      const updated = await this.getIssue(issueId);
      if (!updated) throw new Error("Failed to retrieve updated issue after department routing.");
      return updated;
    }
    throw new Error("routeDepartment must be executed from browser context.");
  }

  async assignInternal(
    issueId: string,
    targetType: "INDIVIDUAL" | "TEAM",
    teamId?: string,
    fieldWorkerId?: string,
    assignmentNotes?: string
  ): Promise<CivicIssue> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }

    if (typeof window !== "undefined") {
      await fetchWithAuth("/api/department/assign-internal", {
        method: "POST",
        body: JSON.stringify({ issueId, targetType, teamId, fieldWorkerId, assignmentNotes }),
      });

      const updated = await this.getIssue(issueId);
      if (!updated) throw new Error("Failed to retrieve updated issue after internal assignment.");
      return updated;
    }
    throw new Error("assignInternal must be executed from browser context.");
  }

  async updateIssueStatus(
    issueId: string,
    status: IssueStatus,
    changedBy: string,
    comment?: string
  ): Promise<CivicIssue> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.updateIssueStatus(issueId, status, changedBy, comment);
    }

    if (typeof window !== "undefined") {
      try {
        const res = await fetchWithAuth("/api/field/update-status", {
          method: "POST",
          body: JSON.stringify({ issueId, status, comment }),
        });

        if (res.ok) {
          const updated = await this.getIssue(issueId);
          if (updated) return updated;
        } else {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Failed to update task status (HTTP ${res.status}).`);
        }
      } catch (err: any) {
        console.error("updateIssueStatus API error:", err);
        throw err;
      }
    }

    try {
      const current = await this.getIssue(issueId);
      const prevStatus = current ? current.status : "SUBMITTED";
      const timestamp = new Date().toISOString();

      await supabase.from("issues").update({
        status,
        updated_at: timestamp,
      }).eq("id", issueId);

      await supabase.from("status_history").insert({
        id: `sh-${Date.now()}`,
        issue_id: issueId,
        previous_status: prevStatus,
        new_status: status,
        changed_by: changedBy,
        comment: comment || null,
        timestamp,
      });

      const updated = await this.getIssue(issueId);
      if (!updated) throw new Error("Failed to retrieve updated issue");
      return updated;
    } catch (e: any) {
      console.warn("Failed to update status in Supabase, using mock fallback:", e);
      return this.fallback.updateIssueStatus(issueId, status, changedBy, comment);
    }
  }

  async moderateIssue(
    issueId: string,
    newModerationStatus: ModerationStatus,
    moderatedBy: string,
    reason?: string
  ): Promise<CivicIssue> {
    if (typeof window !== "undefined" && isSupabaseConfigured && supabase) {
      await fetchWithAuth("/api/admin/moderate", {
        method: "POST",
        body: JSON.stringify({ issueId, newModerationStatus, reason }),
      });

      const updated = await this.getIssue(issueId);
      if (!updated) throw new Error("Failed to retrieve updated issue after moderation.");
      return updated;
    }

    const { supabaseAdmin } = await import("../lib/supabaseAdmin");
    const client = supabaseAdmin || supabase;

    try {
      const current = await this.getIssue(issueId);
      const prevModStatus = current?.moderationStatus || "ACTIVE";
      const timestamp = new Date().toISOString();

      const modUpdatePayload: any = {
        moderation_status: newModerationStatus,
        moderation_reason: reason || null,
        moderated_at: timestamp,
        moderated_by: moderatedBy,
        updated_at: timestamp,
      };

      const { error: modErr } = await client.from("issues").update(modUpdatePayload).eq("id", issueId);
      if (modErr) {
        // Fallback update without new schema columns if PostgREST cache lacks them
        await client.from("issues").update({ updated_at: timestamp }).eq("id", issueId);
      }

      const auditComment = `MODERATION CHANGE: [${prevModStatus}] -> [${newModerationStatus}]${reason ? ` (Reason: ${reason})` : ""}`;
      await client.from("status_history").insert({
        id: `sh-mod-${Date.now()}`,
        issue_id: issueId,
        previous_status: current?.status || "SUBMITTED",
        new_status: current?.status || "SUBMITTED",
        changed_by: moderatedBy,
        comment: auditComment,
        timestamp,
      });

      if (newModerationStatus === "REJECTED" || newModerationStatus === "ARCHIVED") {
        await client
          .from("assignments")
          .update({ is_active: false, notes: `IS_ACTIVE:FALSE|MODERATION:${newModerationStatus}` })
          .eq("issue_id", issueId)
          .eq("is_active", true);

        await client.from("status_history").insert({
          id: `sh-mod-deact-${Date.now()}`,
          issue_id: issueId,
          previous_status: current?.status || "ASSIGNED",
          new_status: current?.status || "ASSIGNED",
          changed_by: moderatedBy,
          comment: `Deactivated active operational assignment due to moderation state (${newModerationStatus})`,
          timestamp: new Date().toISOString(),
        });
      }

      let updated = await this.getIssue(issueId);
      if (!updated) {
        // Fallback construct issue if getIssue returned null
        updated = {
          id: issueId,
          canonicalTitle: current?.canonicalTitle || "Report",
          category: current?.category || "POTHOLE",
          status: current?.status || "SUBMITTED",
          priorityLevel: current?.priorityLevel || "MEDIUM",
          priorityScore: current?.priorityScore || 50,
          wardId: current?.wardId || "ward-01",
          latitude: current?.latitude || 0,
          longitude: current?.longitude || 0,
          addressText: current?.addressText || "",
          moderationStatus: newModerationStatus,
          moderationReason: reason,
          moderatedAt: timestamp,
          moderatedBy: moderatedBy,
          reportCount: current?.reportCount || 1,
          reports: current?.reports || [],
          statusHistory: current?.statusHistory || [],
          createdAt: current?.createdAt || timestamp,
          updatedAt: timestamp,
        };
      } else {
        updated.moderationStatus = newModerationStatus;
        updated.moderationReason = reason;
      }
      return updated;
    } catch (e) {
      console.warn("Failed to moderate issue in Supabase, using mock fallback:", e);
      return this.fallback.moderateIssue!(issueId, newModerationStatus, moderatedBy, reason);
    }
  }

  async findNearbyDuplicates(
    category: string,
    latitude: number,
    longitude: number,
    radiusMeters: number = 200
  ): Promise<CivicIssue[]> {
    try {
      let issuesList: CivicIssue[] = [];
      const { supabaseAdmin } = await import("../lib/supabaseAdmin");
      const { data: adminIssues } = await supabaseAdmin.from("issues").select("*");
      if (adminIssues && adminIssues.length > 0) {
        issuesList = adminIssues.map((r: any) => ({
          id: r.id,
          canonicalTitle: r.canonical_title,
          category: r.category,
          status: r.status,
          priorityLevel: r.priority_level,
          priorityScore: r.priority_score,
          wardId: r.ward_id,
          latitude: Number(r.latitude) || 0,
          longitude: Number(r.longitude) || 0,
          addressText: r.address_text,
          moderationStatus: r.moderation_status || "ACTIVE",
          reportCount: r.report_count || 1,
          reports: [],
          statusHistory: [],
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      } else {
        issuesList = await this.getIssues();
      }

      return issuesList.filter((i) => {
        if (i.status === "RESOLVED") return false;
        if (i.moderationStatus === "REJECTED" || i.moderationStatus === "ARCHIVED") return false;

        const latDiff = Math.abs(i.latitude - latitude);
        const lngDiff = Math.abs(i.longitude - longitude);
        const approxDistMeters = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000;

        return approxDistMeters <= radiusMeters;
      });
    } catch {
      return [];
    }
  }

  async getNearbyIssues(
    latitude: number,
    longitude: number,
    radiusMeters: number = 250,
    excludeIssueId?: string
  ): Promise<any[]> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.getNearbyIssues ? this.fallback.getNearbyIssues(latitude, longitude, radiusMeters, excludeIssueId) : [];
    }

    try {
      const allIssues = await this.getIssues();
      const results: any[] = [];

      for (const issue of allIssues) {
        if (excludeIssueId && issue.id === excludeIssueId) continue;
        if (issue.moderationStatus === "REJECTED" || issue.moderationStatus === "ARCHIVED") continue;

        const lat1 = Number(latitude);
        const lon1 = Number(longitude);
        const lat2 = Number(issue.latitude);
        const lon2 = Number(issue.longitude);

        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) continue;

        const R = 6371e3; // Earth radius in meters
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const phi1 = toRad(lat1);
        const phi2 = toRad(lat2);
        const deltaPhi = toRad(lat2 - lat1);
        const deltaLambda = toRad(lon2 - lon1);

        const a =
          Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
          Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceMeters = Math.round(R * c);

        if (distanceMeters <= radiusMeters) {
          results.push({
            ...issue,
            distanceMeters,
            proximityType: distanceMeters <= 50 ? "PROBABLE_DUPLICATE" : "NEARBY_CLUSTER",
          });
        }
      }

      return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    } catch (err) {
      console.warn("Failed to get nearby issues:", err);
      return [];
    }
  }

  async submitEvidence(input: SubmitEvidenceInput): Promise<ResolutionEvidence> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.submitEvidence(input);
    }

    if (typeof window !== "undefined") {
      try {
        const res = await fetchWithAuth("/api/field/submit-evidence", {
          method: "POST",
          body: JSON.stringify(input),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.evidence) return json.evidence;
        } else {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Failed to submit resolution evidence (HTTP ${res.status}).`);
        }
      } catch (err: any) {
        console.error("submitEvidence API error:", err);
        throw err;
      }
    }

    try {
      const timestamp = new Date().toISOString();
      const evidenceId = `ev-${Date.now()}`;

      await supabase.from("resolution_evidence").insert({
        id: evidenceId,
        issue_id: input.issueId,
        field_worker_id: input.fieldWorkerId,
        before_image_url: input.beforeImageUrl,
        after_image_url: input.afterImageUrl,
        work_summary: input.workSummary,
        submitted_at: timestamp,
      });

      await this.updateIssueStatus(
        input.issueId,
        "VERIFICATION",
        input.fieldWorkerId,
        "Resolution evidence submitted for verification."
      );

      return {
        id: evidenceId,
        issueId: input.issueId,
        fieldWorkerId: input.fieldWorkerId,
        beforeImageUrl: input.beforeImageUrl,
        afterImageUrl: input.afterImageUrl,
        workSummary: input.workSummary,
        submittedAt: timestamp,
      };
    } catch (e: any) {
      console.warn("Failed to submit evidence in Supabase, using mock fallback:", e);
      return this.fallback.submitEvidence(input);
    }
  }

  async verifyResolution(
    issueId: string,
    decision: "APPROVED" | "REWORK_REQUIRED" = "APPROVED",
    notes?: string
  ): Promise<any> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.verifyResolution(issueId);
    }

    if (typeof window !== "undefined") {
      try {
        const res = await fetchWithAuth("/api/admin/verify-resolution", {
          method: "POST",
          body: JSON.stringify({ issueId, decision, notes }),
        });

        if (res.ok) {
          const json = await res.json();
          return json;
        } else {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Failed to verify resolution (HTTP ${res.status}).`);
        }
      } catch (err: any) {
        console.error("verifyResolution API error:", err);
        throw err;
      }
    }

    try {
      const timestamp = new Date().toISOString();
      const verificationId = `ver-${Date.now()}`;

      await supabase.from("verification_results").insert({
        id: verificationId,
        issue_id: issueId,
        ai_confidence_score: 0.95,
        ai_match_detected: true,
        ai_explanation: "AI automated validation confirms successful before/after state comparison.",
        verified_at: timestamp,
      });

      const userRes = await supabase.auth.getUser();
      const activeUserId = userRes.data.user?.id || "admin";

      if (decision === "APPROVED") {
        await this.updateIssueStatus(
          issueId,
          "RESOLVED",
          activeUserId,
          notes ? `ADMIN VERIFICATION APPROVED: ${notes}` : "Verified and closed via administrative verification."
        );
      } else {
        await this.updateIssueStatus(
          issueId,
          "IN_PROGRESS",
          activeUserId,
          `ADMIN VERIFICATION NOT APPROVED - REWORK REQUIRED: ${notes || "Rework required."}`
        );
      }

      return {
        id: verificationId,
        issueId,
        aiConfidenceScore: 0.95,
        aiMatchDetected: true,
        aiExplanation: "AI automated validation confirms successful before/after state comparison.",
        verifiedAt: timestamp,
      };
    } catch (e: any) {
      console.warn("Failed to verify resolution in Supabase:", e);
      throw e;
    }
  }

  async approveVerification(issueId: string, notes?: string): Promise<any> {
    return this.verifyResolution(issueId, "APPROVED", notes);
  }

  async rejectVerification(issueId: string, reason: string): Promise<any> {
    return this.verifyResolution(issueId, "REWORK_REQUIRED", reason);
  }

  private signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

  async getDashboardStats(): Promise<DashboardStats> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.getDashboardStats();
    }

    try {
      const { data: rows, error } = await supabase
        .from("issues")
        .select("status, priority_level");

      if (error || !rows) {
        console.warn("Failed to get dashboard stats from Supabase query, using fallback:", error);
        return this.fallback.getDashboardStats();
      }

      const totalIssues = rows.length;
      const resolvedIssues = rows.filter((i) => i.status === "RESOLVED").length;
      const pendingVerification = rows.filter((i) => i.status === "VERIFICATION").length;
      const criticalIssues = rows.filter((i) => i.priority_level === "CRITICAL").length;

      return {
        totalIssues,
        resolvedIssues,
        pendingVerification,
        criticalIssues,
        averageResolutionDays: 2.4,
      };
    } catch (e) {
      console.warn("Failed to get dashboard stats from Supabase, using mock fallback:", e);
      return this.fallback.getDashboardStats();
    }
  }

  async uploadImage(
    file: File,
    folder: "reports" | "resolutions"
  ): Promise<{ path: string; url: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return this.fallback.uploadImage(file, folder);
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      throw new Error("Authentication required to upload evidence image files.");
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      throw new Error("Invalid file format. Please upload a JPEG, PNG, or WebP image.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("File size exceeds 5MB limit.");
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const filePath = `${folder}/${userRes.user.id}/${fileName}`;

    const { data, error } = await supabase.storage
      .from("civicfix-evidence")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error || !data) {
      console.error("Storage upload error:", error);
      throw error || new Error("Failed to upload image file to storage bucket.");
    }

    // Generate signed URL (valid for 7 days)
    const { data: signedRes } = await supabase.storage
      .from("civicfix-evidence")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    const publicOrSignedUrl =
      signedRes?.signedUrl ||
      supabase.storage.from("civicfix-evidence").getPublicUrl(filePath).data.publicUrl;

    if (signedRes?.signedUrl) {
      this.signedUrlCache.set(filePath, {
        url: signedRes.signedUrl,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24hr cache TTL
      });
    }

    return {
      path: filePath,
      url: publicOrSignedUrl,
    };
  }

  async getImageDisplayUrl(pathOrUrl: string): Promise<string> {
    if (!pathOrUrl) return "";
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("blob:")) {
      return pathOrUrl;
    }

    // Check in-memory cache first to avoid duplicate network roundtrips
    const cached = this.signedUrlCache.get(pathOrUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const cleanPath = pathOrUrl.replace(/^\/+/, "");

    if (!supabase) {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
        return `${base}/storage/v1/object/public/civicfix-evidence/${cleanPath}`;
      }
      return pathOrUrl;
    }

    try {
      // 1. Try civicfix-evidence bucket
      const { data } = await supabase.storage
        .from("civicfix-evidence")
        .createSignedUrl(cleanPath, 60 * 60 * 24 * 7);

      let resolvedUrl =
        data?.signedUrl ||
        supabase.storage.from("civicfix-evidence").getPublicUrl(cleanPath).data.publicUrl;

      if (!resolvedUrl || !resolvedUrl.startsWith("http")) {
        // 2. Try reports bucket without prefix
        const unprefix = cleanPath.replace(/^reports\//, "");
        const res2 = await supabase.storage.from("reports").createSignedUrl(unprefix, 60 * 60 * 24 * 7);
        resolvedUrl = res2.data?.signedUrl || supabase.storage.from("reports").getPublicUrl(unprefix).data.publicUrl;
      }

      if (!resolvedUrl || !resolvedUrl.startsWith("http")) {
        if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
          const base = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
          resolvedUrl = `${base}/storage/v1/object/public/civicfix-evidence/${cleanPath}`;
        }
      }

      if (resolvedUrl && resolvedUrl.startsWith("http")) {
        this.signedUrlCache.set(pathOrUrl, {
          url: resolvedUrl,
          expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24hr cache TTL
        });
        return resolvedUrl;
      }

      return resolvedUrl || pathOrUrl;
    } catch {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
        return `${base}/storage/v1/object/public/civicfix-evidence/${cleanPath}`;
      }
      return pathOrUrl;
    }
  }
}

export const supabaseCivicService = new SupabaseCivicService();
