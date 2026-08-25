"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FieldNavbar } from "@/components/field/FieldNavbar";
import { CivicIssue } from "@/types/civic";
import { civicService } from "@/services/civicService";
import { IssueStatusBadge } from "@/components/civic/IssueStatusBadge";
import { PriorityBadge } from "@/components/civic/PriorityBadge";
import { useAuth } from "@/context/AuthContext";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { getSLAStatus } from "@/services/supabaseCivicService";

export default function FieldIssueDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useAuth();

  const [issue, setIssue] = useState<CivicIssue | null>(null);
  const [loading, setLoading] = useState(true);

  const [workSummary, setWorkSummary] = useState("");
  const [afterImageFile, setAfterImageFile] = useState<File | null>(null);
  const [afterImagePreviewUrl, setAfterImagePreviewUrl] = useState<string | null>(null);

  const [startWorkLoading, setStartWorkLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!id) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const found = await civicService.getIssue(id);
        if (mounted && found) {
          setIssue(found);
          if (found.resolutionEvidence?.workSummary) {
            setWorkSummary(found.resolutionEvidence.workSummary);
          }
        }
      } catch (err: any) {
        console.error("Error loading field task detail:", err);
        if (mounted) {
          setErrorMsg(err.message || "Failed to load task details.");
        }
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

  const handleAfterImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMsg("Please select a valid image file (JPEG, PNG, or WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image file size must be less than 5MB.");
      return;
    }

    setErrorMsg(null);
    setAfterImageFile(file);
    setAfterImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleStartWork = async () => {
    if (!issue) return;
    setStartWorkLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const activeId = user?.id || "field-worker";
      await civicService.updateIssueStatus(issue.id, "IN_PROGRESS", activeId, "Field team arrived on site and commenced work.");
      const updated = await civicService.getIssue(issue.id);
      if (updated) setIssue(updated);
      setSuccessMsg("Task status updated to In Progress. Field team on site.");
    } catch (err: any) {
      console.error("Error starting work:", err);
      setErrorMsg(err.message || "Failed to update status.");
    } finally {
      setStartWorkLoading(false);
    }
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!issue || !workSummary.trim()) {
      setErrorMsg("Work summary is required.");
      return;
    }

    if (!afterImageFile) {
      setErrorMsg("Please upload an actual after-repair evidence photo.");
      return;
    }

    setSubmitting(true);

    try {
      let finalAfterUrl = "";

      // Upload to Supabase Storage resolutions/{auth.uid()} folder
      if (civicService.uploadImage) {
        const uploadRes = await civicService.uploadImage(afterImageFile, "resolutions");
        if (uploadRes?.path) {
          finalAfterUrl = uploadRes.path;
        } else if (uploadRes?.url) {
          finalAfterUrl = uploadRes.url;
        }
      }

      if (!finalAfterUrl) {
        throw new Error("Failed to upload after-repair evidence image to storage.");
      }

      const activeId = user?.id || "field-worker";
      const beforeUrl = issue.reports?.[0]?.imageUrl || "";

      await civicService.submitEvidence({
        issueId: issue.id,
        fieldWorkerId: activeId,
        beforeImageUrl: beforeUrl,
        afterImageUrl: finalAfterUrl,
        workSummary: workSummary.trim(),
      });

      const updated = await civicService.getIssue(issue.id);
      if (updated) setIssue(updated);
      setSuccessMsg("Resolution evidence uploaded and task submitted for verification!");
      setAfterImageFile(null);
      setAfterImagePreviewUrl(null);
    } catch (err: any) {
      console.error("Evidence submission error:", err);
      setErrorMsg(err.message || "Failed to submit resolution evidence.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <FieldNavbar />
        <main className="flex-1 py-20 text-center text-slate-500">Loading task details...</main>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <FieldNavbar />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Task Not Found</h1>
          <Link href="/field" className="inline-block mt-4 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm">
            Back to Assigned Tasks
          </Link>
        </main>
      </div>
    );
  }

  const primaryReport = issue.reports?.[0];
  const slaMetrics = getSLAStatus(issue.assignment?.targetResolutionDate);

  return (
    <RouteGuard allowedRoles={["FIELD_WORKER"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <FieldNavbar />

        <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono text-emerald-400 uppercase">Field Task Workspace • {issue.id}</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{issue.canonicalTitle || "Untitled Issue"}</h1>
            </div>
            <div className="flex items-center space-x-3">
              {slaMetrics && (
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  slaMetrics.status === "OVERDUE" ? "bg-red-950 text-red-300 border-red-800" :
                  slaMetrics.status === "DUE_SOON" ? "bg-amber-950 text-amber-300 border-amber-800" :
                  slaMetrics.status === "ON_TRACK" ? "bg-emerald-950 text-emerald-300 border-emerald-800" :
                  "bg-slate-900 text-slate-400 border-slate-800"
                }`}>
                  ⏱️ SLA: {slaMetrics.label}
                </span>
              )}
              <IssueStatusBadge status={issue.status} />
            </div>
          </div>

          {successMsg && (
            <div className="p-4 bg-emerald-900/40 border border-emerald-500/50 text-emerald-200 text-sm rounded-xl">
              {successMsg}
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-red-900/40 border border-red-500/50 text-red-200 text-sm rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Rework Required Alert Banner */}
          {issue.status === "IN_PROGRESS" && (() => {
            const reworkHist = (issue.statusHistory || [])
              .slice()
              .reverse()
              .find((h) => h.comment?.startsWith("ADMIN VERIFICATION NOT APPROVED - REWORK REQUIRED:"));
            const reworkNotes = reworkHist?.comment?.replace("ADMIN VERIFICATION NOT APPROVED - REWORK REQUIRED:", "").trim();
            if (!reworkNotes) return null;
            return (
              <div className="p-5 bg-amber-950/60 border border-amber-500/60 rounded-2xl space-y-2.5 shadow-lg">
                <div className="flex items-center space-x-2 text-amber-300 font-bold text-sm">
                  <span className="text-lg">⚠️</span>
                  <span>Rework Required — Municipal Admin Instructions</span>
                </div>
                <p className="text-xs text-amber-200 leading-relaxed bg-amber-950/90 p-3.5 rounded-xl border border-amber-800/80 font-mono">
                  {reworkNotes}
                </p>
                <p className="text-[11px] text-amber-400/90">
                  Please perform the requested additional repairs, enter an updated work summary, and upload fresh after-repair evidence photos below.
                </p>
              </div>
            );
          })()}

          {/* Issue Overview & Before Photo Evidence */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-bold text-white">Citizen Report & Location</h2>
            
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase">Priority</span>
                <div className="mt-1"><PriorityBadge level={issue.priorityLevel || "LOW"} score={issue.priorityScore ?? 0} /></div>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase">Category</span>
                <p className="font-bold text-white mt-1">{issue.category || "OTHER"}</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase">Ward Location</span>
                <p className="font-bold text-white mt-1">{issue.wardId || "N/A"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase">Citizen Address & Details</span>
              <p className="text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 leading-relaxed text-sm">
                {issue.addressText || "Address recorded"} — {primaryReport?.description || "No description provided."}
              </p>
            </div>

            {primaryReport?.imageUrl && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase">Before Repair Photo (Citizen Evidence)</span>
                <div className="rounded-xl overflow-hidden max-w-md border border-slate-800 relative h-64 bg-slate-950">
                  {primaryReport.imageUrl.startsWith("http://") ||
                  primaryReport.imageUrl.startsWith("https://") ||
                  primaryReport.imageUrl.startsWith("/") ? (
                    <Image
                      src={primaryReport.imageUrl}
                      alt="Citizen evidence photo"
                      fill
                      sizes="(max-width: 768px) 100vw, 448px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono p-4 text-center">
                      📷 Photo attached
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Resolution Execution & Evidence Submission Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-bold text-white">Resolution Execution & Evidence Submission</h2>

            {issue.status === "ASSIGNED" && (
              <button
                type="button"
                onClick={handleStartWork}
                disabled={startWorkLoading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-sm text-sm disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <span>{startWorkLoading ? "Updating Task Status..." : "Mark Task as In Progress (Field Team On Site)"}</span>
              </button>
            )}

            {(issue.status === "IN_PROGRESS" || issue.status === "ASSIGNED") && (
              <form onSubmit={handleSubmitEvidence} className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase">1. Mandatory Work Summary</label>
                  <textarea
                    rows={3}
                    value={workSummary}
                    onChange={(e) => setWorkSummary(e.target.value)}
                    placeholder="Describe repair actions taken on site, materials used, crew members..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    required
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300 uppercase">2. Attach After-Repair Evidence Photo</label>
                    <span className="text-xs text-slate-400">Max 5MB (JPG, PNG, WebP)</span>
                  </div>

                  {/* File Input Box */}
                  <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500 rounded-2xl p-6 text-center transition-colors bg-slate-950/60">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      onChange={handleAfterImageFileChange}
                      id="worker-evidence-input"
                      className="hidden"
                    />
                    <label htmlFor="worker-evidence-input" className="cursor-pointer space-y-2 block">
                      <div className="w-12 h-12 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center justify-center mx-auto font-bold text-xl">
                        📸
                      </div>
                      <p className="text-sm font-bold text-white">
                        {afterImageFile ? afterImageFile.name : "Click to Upload Repair Evidence Photo"}
                      </p>
                      <p className="text-xs text-slate-400">
                        Uploads directly to resolutions/{user?.id || "worker"} in Supabase Storage
                      </p>
                    </label>
                  </div>

                  {/* Image Preview if Uploaded */}
                  {afterImagePreviewUrl && (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/50 h-48 max-w-md mx-auto shadow-sm">
                      <Image
                        src={afterImagePreviewUrl}
                        alt="After evidence preview"
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAfterImageFile(null);
                          setAfterImagePreviewUrl(null);
                        }}
                        className="absolute top-2 right-2 px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold shadow"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-sm text-sm disabled:opacity-50"
                >
                  {submitting ? "Uploading Evidence..." : "Submit Resolution Evidence for AI Visual Verification"}
                </button>
              </form>
            )}

            {issue.status === "VERIFICATION" && (
              <div className="p-6 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-center space-y-3">
                <h4 className="font-bold text-emerald-400">Evidence Submitted Successfully</h4>
                <p className="text-xs text-slate-300">
                  This task is currently under automated AI before/after verification and citizen review.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </RouteGuard>
  );
}
