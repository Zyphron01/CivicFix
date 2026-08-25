"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AdminNavbar } from "@/components/admin/AdminNavbar";
import { AssignmentTargetType, CivicIssue, IssueStatus, ModerationStatus, PriorityLevel, Team, UserProfile, NearbyReportCluster } from "@/types/civic";
import { civicService } from "@/services/civicService";
import { IssueStatusBadge } from "@/components/civic/IssueStatusBadge";
import { PriorityBadge } from "@/components/civic/PriorityBadge";
import { IssueTimeline } from "@/components/civic/IssueTimeline";
import { useAuth } from "@/context/AuthContext";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { getSLAStatus, calculateWorkloadCapacity } from "@/services/supabaseCivicService";

const DEPARTMENTS = [
  { id: "dept-roads", name: "Roads & Infrastructure" },
  { id: "dept-sanitation", name: "Sanitation & Waste Management" },
  { id: "dept-electrical", name: "Electrical Department" },
  { id: "dept-water", name: "Water Board" },
];

export default function AdminIssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { user } = useAuth();

  const [issue, setIssue] = useState<CivicIssue | null>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic workforce and team states
  const [teams, setTeams] = useState<Team[]>([]);
  const [allIssues, setAllIssues] = useState<CivicIssue[]>([]);
  const [nearbyIssues, setNearbyIssues] = useState<NearbyReportCluster[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [selectedDept, setSelectedDept] = useState("dept-roads");
  const [selectedTeam, setSelectedTeam] = useState<string>("");

  // Moderation state
  const [modReason, setModReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [modLoading, setModLoading] = useState(false);
  const [overridePriority, setOverridePriority] = useState<PriorityLevel>("MEDIUM");
  const [overrideCategory, setOverrideCategory] = useState<string>("POTHOLE");
  const [newStatus, setNewStatus] = useState<IssueStatus>("ASSIGNED");
  const [comment, setComment] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [departmentNotes, setDepartmentNotes] = useState("");
  const [routingLoading, setRoutingLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Resolution verification state
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!id) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const [found, fetchedTeams, fetchedIssues] = await Promise.all([
          civicService.getIssue(id),
          civicService.getTeams ? civicService.getTeams() : Promise.resolve([]),
          civicService.getIssues ? civicService.getIssues() : Promise.resolve([]),
        ]);

        if (mounted) {
          setAllIssues(fetchedIssues || []);
          if (fetchedTeams && fetchedTeams.length > 0) {
            setTeams(fetchedTeams);
            setSelectedTeam(fetchedTeams[0].id);
          }

          if (found) {
            setIssue(found);
            setSelectedDept(found.departmentId || "dept-roads");
            if (found.assignment?.teamId) setSelectedTeam(found.assignment.teamId);
            setOverridePriority(found.priorityLevel || "MEDIUM");
            setOverrideCategory(found.category || "POTHOLE");
            setNewStatus(found.status || "ASSIGNED");

            // Fetch spatial proximity cluster
            if (civicService.getNearbyIssues && found.latitude && found.longitude) {
              setNearbyLoading(true);
              civicService
                .getNearbyIssues(found.latitude, found.longitude, 250, found.id)
                .then((clusters) => {
                  if (mounted) setNearbyIssues(clusters);
                })
                .finally(() => {
                  if (mounted) setNearbyLoading(false);
                });
            }
          }
        }
      } catch (err) {
        console.error("Error loading issue details in admin workspace:", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [id]);

  const handleRouteDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue) return;
    setRoutingLoading(true);
    try {
      if (civicService.routeDepartment) {
        await civicService.routeDepartment(issue.id, selectedDept, departmentNotes);
      }
      const updated = await civicService.getIssue(issue.id);
      if (updated) setIssue(updated);
      setSuccessMsg(`Successfully routed issue to department (${selectedDept}). Status: ROUTED_TO_DEPARTMENT.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to route issue to department.");
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleAssignInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue) return;
    setAssigning(true);
    try {
      if (civicService.assignInternal) {
        await civicService.assignInternal(
          issue.id,
          "TEAM",
          selectedTeam,
          undefined,
          comment
        );
      }
      const updated = await civicService.getIssue(issue.id);
      if (updated) setIssue(updated);
      setSuccessMsg("Successfully assigned operational response crew.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to execute internal assignment.");
    } finally {
      setAssigning(false);
    }
  };

  const handleModerateState = async (newModStatus: ModerationStatus, customReason?: string) => {
    if (!issue) return;
    setModLoading(true);
    try {
      const activeAdminId = user?.id || "admin";
      if (civicService.moderateIssue) {
        await civicService.moderateIssue(issue.id, newModStatus, activeAdminId, customReason || modReason);
      }
      const updated = await civicService.getIssue(issue.id);
      if (updated) setIssue(updated);
      setSuccessMsg(`Report moderation state updated to [${newModStatus}].`);
      setShowRejectModal(false);
      setModReason("");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to update report moderation status.");
    } finally {
      setModLoading(false);
    }
  };

  const handleVerifyDecision = async (decision: "APPROVED" | "REWORK_REQUIRED") => {
    if (!issue) return;
    if (decision === "REWORK_REQUIRED" && !verifyNotes.trim()) {
      setVerifyError("Admin rework instructions are required when sending a task back for rework.");
      return;
    }

    setVerifyLoading(true);
    setVerifyError(null);
    setSuccessMsg(null);

    try {
      await civicService.verifyResolution(issue.id, decision, verifyNotes.trim());
      const updated = await civicService.getIssue(issue.id);
      if (updated) setIssue(updated);
      setSuccessMsg(
        decision === "APPROVED"
          ? "Resolution approved! The issue has been marked as Resolved."
          : "Task sent back to operational crew for rework (Status: In Progress)."
      );
      setVerifyNotes("");
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error("Verification decision error:", err);
      setVerifyError(err.message || "Failed to submit verification decision.");
    } finally {
      setVerifyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <AdminNavbar />
        <main className="flex-1 py-20 text-center text-slate-500">Loading issue review workspace...</main>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <AdminNavbar />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Issue Not Found</h1>
          <p className="text-slate-400 text-sm">The requested issue ID ({id}) could not be located.</p>
          <Link href="/admin/issues" className="inline-block mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm">
            Back to Triage Queue
          </Link>
        </main>
      </div>
    );
  }

  const getTeamActiveCount = (tId: string) => {
    return allIssues.filter((i) => {
      const asg = i.assignment || (i as any).assignments?.[0];
      return asg && asg.isActive !== false && asg.targetType === "TEAM" && asg.teamId === tId;
    }).length;
  };

  const slaMetrics = issue ? getSLAStatus(issue.assignment?.targetResolutionDate) : null;
  const currentSelectedTeamCount = selectedTeam ? getTeamActiveCount(selectedTeam) : 0;
  const selectedTargetCapacity = calculateWorkloadCapacity(currentSelectedTeamCount);
  const modStatus = issue.moderationStatus || "ACTIVE";

  return (
    <RouteGuard allowedRoles={["MUNICIPAL_ADMIN"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <AdminNavbar />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <Link href="/admin/issues" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                  ← Back to Triage Queue
                </Link>
                <span className="text-slate-600">•</span>
                <span className="text-xs font-mono text-slate-400">{issue.id}</span>
                <span className="text-slate-600">•</span>
                <span className="text-xs font-mono text-slate-400">
                  Reported: {new Date(issue.createdAt).toLocaleString()}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {issue.canonicalTitle || "Issue Detail & Triage"}
              </h1>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-400">Moderation Queue:</span>
              <span
                className={`text-xs font-extrabold px-3 py-1 rounded-full border ${
                  modStatus === "ACTIVE"
                    ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                    : modStatus === "UNDER_REVIEW"
                    ? "bg-blue-950 text-blue-400 border-blue-800"
                    : modStatus === "SUSPICIOUS"
                    ? "bg-amber-950 text-amber-400 border-amber-800"
                    : modStatus === "REJECTED"
                    ? "bg-red-950 text-red-400 border-red-800"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                {modStatus}
              </span>
              <IssueStatusBadge status={issue.status} />
            </div>
          </div>

          {/* Contextual Moderation Status Banner */}
          {modStatus === "SUSPICIOUS" && (
            <div className="p-4 bg-amber-950/50 border border-amber-800 text-amber-300 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">⚠️</span>
                <span>
                  <strong>Quarantined Report:</strong> This report has been flagged as suspicious. Operational dispatch is paused pending quality inspection.
                </span>
              </div>
              <Link href="/admin/issues?tab=SUSPICIOUS" className="font-bold underline text-amber-200 ml-4">
                View Suspicious Queue →
              </Link>
            </div>
          )}

          {modStatus === "REJECTED" && (
            <div className="p-4 bg-red-950/50 border border-red-800 text-red-300 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🚫</span>
                <span>
                  <strong>Report Rejected & Archived:</strong> {issue.moderationReason ? `Reason: ${issue.moderationReason}` : "Deactivated from operational dispatch."}
                </span>
              </div>
              <Link href="/admin/issues?tab=REJECTED" className="font-bold underline text-red-200 ml-4">
                View Rejected Archive →
              </Link>
            </div>
          )}

          {modStatus === "UNDER_REVIEW" && (
            <div className="p-4 bg-blue-950/50 border border-blue-800 text-blue-300 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🔍</span>
                <span>
                  <strong>Under Administrative Review:</strong> This issue requires secondary municipal evaluation before dispatch.
                </span>
              </div>
              <Link href="/admin/issues?tab=UNDER_REVIEW" className="font-bold underline text-blue-200 ml-4">
                View Review Queue →
              </Link>
            </div>
          )}

          {modStatus === "ARCHIVED" && (
            <div className="p-4 bg-slate-900 border border-slate-700 text-slate-300 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">📦</span>
                <span>
                  <strong>Report Archived:</strong> This report has been archived and removed from active field operations. Full audit history is preserved in historical records.
                </span>
              </div>
              <Link href="/admin/issues?tab=ARCHIVED" className="font-bold underline text-blue-400 hover:text-blue-300 ml-4">
                View Archived Records →
              </Link>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-2xl text-xs font-bold flex items-center space-x-2">
              <span>✓</span>
              <span>{successMsg}</span>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Content Area */}
            <div className="lg:col-span-2 space-y-8">
              {/* Primary Overview Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Issue Category</span>
                  <span className="text-sm font-bold text-white px-3 py-1 bg-slate-800 border border-slate-700 rounded-xl">
                    {issue.category}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 text-xs font-medium">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Municipal Ward</span>
                    <span className="text-white font-bold text-sm">{issue.wardId || "N/A"}</span>
                  </div>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Responsible Department</span>
                    <span className="text-blue-400 font-bold text-sm">{issue.departmentId || "Unassigned"}</span>
                  </div>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Priority Assessment</span>
                    <PriorityBadge level={issue.priorityLevel} score={issue.priorityScore} />
                  </div>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Location Source & Accuracy</span>
                    <span className="text-emerald-400 font-bold">
                      {issue.locationSource === "LIVE_PRECISE_DEVICE" ? "🛰️ Live GPS" : "📍 Map Selected"}{" "}
                      {issue.locationAccuracy ? `(±${Math.round(issue.locationAccuracy)}m)` : ""}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase">Recorded Address / Neighborhood</span>
                  <p className="text-sm text-slate-200 bg-slate-950 p-4 rounded-xl border border-slate-800">
                    {issue.addressText || `${issue.latitude.toFixed(5)}, ${issue.longitude.toFixed(5)}`}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">
                    Coordinates: {issue.latitude.toFixed(6)}, {issue.longitude.toFixed(6)}
                  </p>
                </div>

                {/* Submitted Photo Evidence */}
                {issue.reports?.[0]?.imageUrl && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase">Citizen Evidence Photo</span>
                    <div className="rounded-xl overflow-hidden max-w-lg border border-slate-800 relative h-64 bg-slate-950">
                      {issue.reports[0].imageUrl.startsWith("http://") ||
                      issue.reports[0].imageUrl.startsWith("https://") ||
                      issue.reports[0].imageUrl.startsWith("/") ? (
                        <Image
                          src={issue.reports[0].imageUrl}
                          alt="Citizen evidence photo"
                          fill
                          sizes="(max-width: 1024px) 100vw, 600px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono p-4 text-center">
                          📷 Image stored at: {issue.reports[0].imageUrl}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Multimodal AI Triage Assessment Card */}
              {issue.aiAssessment && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">🤖</span>
                      <h2 className="text-lg font-bold text-white">Multimodal Gemini AI Triage Intelligence</h2>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold px-2.5 py-1 bg-purple-950 text-purple-300 border border-purple-800 rounded-full">
                        AI-Assisted • Pending Confirmation
                      </span>
                      <span className="text-xs font-mono font-bold px-2.5 py-1 bg-blue-950 text-blue-300 border border-blue-800 rounded-full">
                        Confidence: {Math.round((issue.aiAssessment.confidenceScore ?? 1) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 text-xs font-medium">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Civic Validity</span>
                      <span className={issue.aiAssessment.isCivicIssue ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {issue.aiAssessment.isCivicIssue ? "✓ Genuine Civic Infrastructure Issue" : "⚠️ Non-Civic Concern"}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Jurisdiction</span>
                      <span className={issue.aiAssessment.inJurisdiction ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {issue.aiAssessment.inJurisdiction ? "✓ Municipal Zone" : "⚠️ Outside Jurisdiction"}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Severity / Priority Score</span>
                      <span className="text-white font-bold">{issue.aiAssessment.priorityLevel} ({issue.aiAssessment.priorityScore}/100)</span>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Hazard Classification</span>
                      <span className="text-red-400 font-bold">{issue.aiAssessment.hazardClassification || "Standard Hazard"}</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 text-sm text-slate-300">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Recommended Department</span>
                      <p className="font-bold text-blue-400">{issue.aiAssessment.recommendedDepartment}</p>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase block mb-1">AI Reasoning</span>
                      <p className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs leading-relaxed text-slate-300">
                        {issue.aiAssessment.reasoning}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Recommended Work Summary</span>
                      <p className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs leading-relaxed text-slate-300 font-mono">
                        {issue.aiAssessment.workSummary}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolution Verification & Final Approval Panel */}
              {(issue.status === "VERIFICATION" || issue.resolutionEvidence || issue.verificationResult) && (
                <div className="bg-slate-900 border-2 border-amber-600/40 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">🔍</span>
                      <div>
                        <h2 className="text-xl font-extrabold text-white tracking-tight">Resolution Verification</h2>
                        <p className="text-xs text-slate-400">Review field repair evidence and submit final administrative resolution decision.</p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-mono px-3 py-1 rounded-full border font-bold ${
                        issue.status === "VERIFICATION"
                          ? "bg-amber-950 text-amber-300 border-amber-800 animate-pulse"
                          : issue.status === "RESOLVED"
                          ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                          : "bg-blue-950 text-blue-300 border-blue-800"
                      }`}
                    >
                      {issue.status === "VERIFICATION"
                        ? "Verification Pending"
                        : issue.status === "RESOLVED"
                        ? "✓ Resolved & Closed"
                        : "Rework In Progress"}
                    </span>
                  </div>

                  {/* A. BEFORE VS AFTER EVIDENCE COMPARISON */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      A. Before & After Resolution Evidence
                    </label>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* Before / Citizen Report Photo */}
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase">
                          <span>1. Citizen Report (Before)</span>
                          <span className="text-slate-500 font-mono">Original</span>
                        </div>
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                          {issue.reports?.[0]?.imageUrl ? (
                            <Image
                              src={issue.reports[0].imageUrl}
                              alt="Citizen before report"
                              fill
                              sizes="(max-width: 768px) 100vw, 400px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                              📷 No photo attached
                            </div>
                          )}
                        </div>
                      </div>

                      {/* After / Field Crew Repair Photo */}
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase">
                          <span>2. Field Crew Repair (After)</span>
                          <span className="text-slate-500 font-mono">
                            {issue.resolutionEvidence?.submittedAt ? new Date(issue.resolutionEvidence.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recent"}
                          </span>
                        </div>
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                          {issue.resolutionEvidence?.afterImageUrl ? (
                            <Image
                              src={issue.resolutionEvidence.afterImageUrl}
                              alt="After repair evidence"
                              fill
                              sizes="(max-width: 768px) 100vw, 400px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                              📷 No after photo uploaded
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* B. FIELD WORK SUMMARY & CREW DETAILS */}
                  {issue.resolutionEvidence?.workSummary && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                          B. Field Crew Work Summary
                        </label>
                        <span className="text-xs text-slate-400">
                          Crew: <strong className="text-white">{teams.find((t) => t.id === issue.assignment?.teamId)?.name || issue.assignment?.teamId || "Operational Team"}</strong>
                        </span>
                      </div>
                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 leading-relaxed font-mono">
                        {issue.resolutionEvidence.workSummary}
                      </div>
                    </div>
                  )}

                  {/* C. AI VERIFICATION RESULT (ADVISORY ONLY) */}
                  {issue.verificationResult && (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                          <span>🤖</span>
                          <span>AI Verification Advisory (Advisory Only)</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          Verified: {new Date(issue.verificationResult.verifiedAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">AI Confidence Score</span>
                          <span className="text-emerald-400 font-bold text-sm">
                            {Math.round(issue.verificationResult.aiConfidenceScore * 100)}%
                          </span>
                        </div>
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Visual Match Detection</span>
                          <span className={issue.verificationResult.aiMatchDetected ? "text-emerald-400 font-bold text-sm" : "text-amber-400 font-bold text-sm"}>
                            {issue.verificationResult.aiMatchDetected ? "✓ Repair Match Detected" : "⚠️ Discrepancy Detected"}
                          </span>
                        </div>
                      </div>

                      {issue.verificationResult.aiExplanation && (
                        <p className="text-xs text-slate-400 leading-relaxed italic bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
                          &ldquo;{issue.verificationResult.aiExplanation}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                  {/* D. ADMIN DECISION CONTROLS (Active when VERIFICATION) */}
                  {issue.status === "VERIFICATION" && (
                    <div className="pt-4 space-y-4 border-t border-slate-800">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        D. Municipal Admin Decision
                      </h3>

                      {verifyError && (
                        <div className="p-3.5 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs font-bold flex items-center space-x-2">
                          <span>⚠️</span>
                          <span>{verifyError}</span>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Admin Verification Notes / Rework Instructions
                        </label>
                        <textarea
                          rows={3}
                          value={verifyNotes}
                          onChange={(e) => setVerifyNotes(e.target.value)}
                          placeholder="Add approval comments or provide mandatory rework instructions for field crew..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-600"
                        />
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4 pt-1">
                        <button
                          type="button"
                          disabled={verifyLoading}
                          onClick={() => handleVerifyDecision("APPROVED")}
                          className="py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
                        >
                          <span>{verifyLoading ? "Processing Decision..." : "✅ Verify & Resolve Issue"}</span>
                        </button>

                        <button
                          type="button"
                          disabled={verifyLoading}
                          onClick={() => handleVerifyDecision("REWORK_REQUIRED")}
                          className="py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-sm transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
                        >
                          <span>{verifyLoading ? "Processing Decision..." : "🔄 Verification Failed – Send Back for Rework"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Nearby Reports & Spatial Proximity Cluster Widget */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">📍</span>
                    <h2 className="text-lg font-bold text-white">Spatial Proximity & Nearby Incidents</h2>
                  </div>
                  <span className="text-xs font-mono px-3 py-1 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                    Radius: 250m
                  </span>
                </div>

                {nearbyLoading ? (
                  <p className="text-xs text-slate-500 py-4">Scanning nearby incident clusters...</p>
                ) : nearbyIssues.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">
                    No active reports detected within 250m radius. This issue is an isolated report.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300 font-medium">
                      Found <strong className="text-amber-400">{nearbyIssues.length} nearby report(s)</strong> within 250m:
                    </p>
                    <div className="space-y-2">
                      {nearbyIssues.map((nearby) => (
                        <div
                          key={nearby.id}
                          className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div className="space-y-0.5 max-w-md truncate">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  nearby.proximityType === "PROBABLE_DUPLICATE"
                                    ? "bg-red-950 text-red-400 border border-red-800"
                                    : "bg-amber-950 text-amber-400 border border-amber-800"
                                }`}
                              >
                                {nearby.proximityType === "PROBABLE_DUPLICATE" ? "⚠ Probable Duplicate" : "📍 Nearby Cluster"}{" "}
                                ({nearby.distanceMeters}m)
                              </span>
                              <span className="font-mono text-slate-400">{nearby.id}</span>
                            </div>
                            <p className="font-semibold text-white truncate">{nearby.canonicalTitle}</p>
                          </div>
                          <Link
                            href={`/admin/issues/${nearby.id}`}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold rounded-lg text-xs transition-colors whitespace-nowrap ml-2"
                          >
                            Inspect →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status History Timeline */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                <h2 className="text-lg font-bold text-white">Lifecycle & Moderation Audit Trail</h2>
                <IssueTimeline currentStatus={issue.status} statusHistory={issue.statusHistory} />
              </div>
            </div>

            {/* Right Control Sidebar */}
            <div className="space-y-8">
              {/* Report Moderation & Quality Control Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>🛡️</span>
                    <span>Report Moderation</span>
                  </h3>
                  <span
                    className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${
                      modStatus === "ACTIVE"
                        ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                        : modStatus === "UNDER_REVIEW"
                        ? "bg-blue-950 text-blue-400 border-blue-800"
                        : modStatus === "SUSPICIOUS"
                        ? "bg-amber-950 text-amber-400 border-amber-800"
                        : modStatus === "REJECTED"
                        ? "bg-red-950 text-red-400 border-red-800"
                        : "bg-slate-800 text-slate-300 border-slate-700"
                    }`}
                  >
                    {modStatus}
                  </span>
                </div>

                {issue.moderationReason && (
                  <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-xl text-xs text-red-300 space-y-1">
                    <span className="font-bold block uppercase text-[10px]">Logged Reason</span>
                    <p>{issue.moderationReason}</p>
                  </div>
                )}

                {/* Moderation Actions */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={modLoading || modStatus === "UNDER_REVIEW"}
                    onClick={() => handleModerateState("UNDER_REVIEW")}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-blue-400 border border-slate-800 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                  >
                    🔍 Review
                  </button>

                  <button
                    type="button"
                    disabled={modLoading || modStatus === "SUSPICIOUS"}
                    onClick={() => handleModerateState("SUSPICIOUS")}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-amber-400 border border-slate-800 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                  >
                    ⚠️ Suspicious
                  </button>

                  <button
                    type="button"
                    disabled={modLoading || modStatus === "REJECTED"}
                    onClick={() => setShowRejectModal(true)}
                    className="px-3 py-2 bg-red-950/50 hover:bg-red-900/50 text-red-400 border border-red-900/80 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                  >
                    🚫 Reject
                  </button>

                  <button
                    type="button"
                    disabled={modLoading || modStatus === "ARCHIVED"}
                    onClick={() => handleModerateState("ARCHIVED")}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                  >
                    📦 Archive
                  </button>
                </div>

                {modStatus !== "ACTIVE" && (
                  <button
                    type="button"
                    disabled={modLoading}
                    onClick={() => handleModerateState("ACTIVE", "Restored to active operational state by administrator")}
                    className="w-full py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800 rounded-xl text-xs font-bold transition-colors mt-2"
                  >
                    🔄 Restore Report to Active
                  </button>
                )}
              </div>

              {showRejectModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                    <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                      <span className="text-red-500">🚫</span>
                      <span>Reject Invalid / Duplicate Report</span>
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Rejecting a report excludes it from operational dispatch and deactivates active assignments. A mandatory moderation reason must be logged for audit purposes.
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        Mandatory Rejection Reason
                      </label>
                      <textarea
                        rows={3}
                        value={modReason}
                        onChange={(e) => setModReason(e.target.value)}
                        placeholder="e.g. Duplicate of issue-102, non-civic private property, invalid photo..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:ring-2 focus:ring-red-500 outline-none resize-none"
                      />
                    </div>
                    <div className="flex space-x-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowRejectModal(false)}
                        className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={modLoading || !modReason.trim()}
                        onClick={() => handleModerateState("REJECTED", modReason.trim())}
                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
                      >
                        Confirm Rejection
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 1. MUNICIPAL ADMIN DEPARTMENT ROUTING FORM */}
              <form onSubmit={handleRouteDepartment} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center justify-between">
                  <span>🏛️ Municipal Department Routing</span>
                  <span className="text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded uppercase">
                    Admin Action
                  </span>
                </h3>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Responsible Department
                  </label>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Department Routing Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={departmentNotes}
                    onChange={(e) => setDepartmentNotes(e.target.value)}
                    placeholder="Provide routing context, priority instructions, or department notes..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={routingLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors shadow-md disabled:opacity-50"
                >
                  {routingLoading ? "Routing to Department..." : "Submit to Department →"}
                </button>
              </form>

              {/* 2. OPERATIONAL RESPONSE CREW / TEAM ASSIGNMENT FORM */}
              <form onSubmit={handleAssignInternal} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center justify-between">
                  <span>👷 Operational Team Dispatch</span>
                  <span className="text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded uppercase">
                    Department Crew
                  </span>
                </h3>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Target Operational Crew / Team
                  </label>
                  <select
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.specialization})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-xl text-xs space-y-1">
                  <span className="text-purple-300 font-bold uppercase tracking-wider block text-[10px]">
                    Operational Dispatch SLA
                  </span>
                  <p className="text-slate-300">
                    SLA Target: <strong>{slaMetrics?.hoursRemaining ?? 48} hours</strong>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Crew Dispatch Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Enter crew instructions, vehicle dispatch notes..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={assigning}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-colors shadow-md disabled:opacity-50"
                >
                  {assigning ? "Dispatching Crew..." : "Dispatch Operational Team →"}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </RouteGuard>
  );
}
