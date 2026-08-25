"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { civicService } from "@/services/civicService";
import { CivicIssue } from "@/types/civic";
import { IssueStatusBadge } from "@/components/civic/IssueStatusBadge";
import { PriorityBadge } from "@/components/civic/PriorityBadge";
import { IssueTimeline } from "@/components/civic/IssueTimeline";

export default function IssueDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [issue, setIssue] = useState<CivicIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!id) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        setError(null);
        const found = await civicService.getIssue(id);
        if (mounted) {
          setIssue(found);
        }
      } catch (err: any) {
        console.error("Error loading issue details:", err);
        if (mounted) {
          setError(err.message || "Failed to load issue details.");
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Navbar />
        <main className="flex-1 py-20 text-center text-slate-500">Loading tracking details...</main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Issue</h1>
          <p className="text-slate-600 text-sm">{error}</p>
          <Link href="/my-reports" className="inline-block mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm">
            Back to My Reports
          </Link>
        </main>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">Issue Not Found</h1>
          <p className="text-slate-600 text-sm">The requested civic tracking ID ({id}) could not be located.</p>
          <Link href="/my-reports" className="inline-block mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm">
            Back to My Reports
          </Link>
        </main>
      </div>
    );
  }

  const primaryReport = issue.reports?.[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono font-medium text-slate-500 uppercase">{issue.id}</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{issue.canonicalTitle || "Untitled Civic Issue"}</h1>
            </div>
            <IssueStatusBadge status={issue.status} />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <PriorityBadge level={issue.priorityLevel || "LOW"} score={issue.priorityScore ?? 0} />
            <span className="text-xs px-3 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium">
              Ward: {issue.wardId || "N/A"}
            </span>
            <span className="text-xs px-3 py-1 bg-blue-50 text-blue-700 rounded-lg font-medium">
              Category: {issue.category || "OTHER"}
            </span>
            {issue.departmentId && (
              <span className="text-xs px-3 py-1 bg-purple-50 text-purple-700 rounded-lg font-medium">
                Dept: {issue.departmentId}
              </span>
            )}
          </div>

          {/* Description & Location */}
          <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 text-sm">
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800">Description & Reports</h4>
              <p className="text-slate-600 leading-relaxed">{primaryReport?.description || issue.addressText || "No additional description provided."}</p>
              <p className="text-xs text-slate-400">Total clustered reports: {issue.reportCount ?? 1}</p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-800">Location & Coordinates</h4>
              <p className="text-slate-600">{issue.addressText || "Location recorded"}</p>
              <p className="text-xs font-mono text-slate-400">Lat: {issue.latitude ?? 0}, Lng: {issue.longitude ?? 0}</p>
            </div>
          </div>

          {/* Photo Evidence if available */}
          {primaryReport?.imageUrl && (
            <div className="pt-4 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 mb-3 text-sm">Citizen Evidence Photo</h4>
              <div className="rounded-xl overflow-hidden max-w-md border border-slate-200 relative h-64 bg-slate-50">
                {primaryReport.imageUrl.startsWith("http://") ||
                primaryReport.imageUrl.startsWith("https://") ||
                primaryReport.imageUrl.startsWith("/") ? (
                  <Image
                    src={primaryReport.imageUrl}
                    alt="Citizen report evidence"
                    fill
                    sizes="(max-width: 768px) 100vw, 448px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-mono p-4 text-center">
                    📷 Photo attached
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status Timeline */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-slate-900">Civic Resolution Lifecycle</h3>
          <IssueTimeline currentStatus={issue.status} statusHistory={issue.statusHistory || []} />
        </div>

        {/* Resolution Evidence / Verification Section */}
        {issue.resolutionEvidence && (
          <div className="bg-white border border-emerald-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 bg-emerald-50/20">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-emerald-900">Field Resolution Evidence</h3>
              <span className="text-xs px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                AI Confidence: {issue.verificationResult ? `${Math.round((issue.verificationResult.aiConfidenceScore ?? 1) * 100)}%` : "Pending"}
              </span>
            </div>

            <p className="text-sm text-slate-700">
              <span className="font-semibold">Work Summary:</span> {issue.resolutionEvidence.workSummary}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {issue.resolutionEvidence.beforeImageUrl && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Before Work</p>
                  <div className="rounded-xl border h-48 w-full relative overflow-hidden">
                    <Image
                      src={issue.resolutionEvidence.beforeImageUrl}
                      alt="Before work"
                      fill
                      sizes="(max-width: 768px) 100vw, 300px"
                      className="object-cover"
                    />
                  </div>
                </div>
              )}
              {issue.resolutionEvidence.afterImageUrl && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">After Work (Resolved)</p>
                  <div className="rounded-xl border h-48 w-full relative overflow-hidden">
                    <Image
                      src={issue.resolutionEvidence.afterImageUrl}
                      alt="After work"
                      fill
                      sizes="(max-width: 768px) 100vw, 300px"
                      className="object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            {issue.verificationResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                <p className="font-bold">AI Visual Verification Passed</p>
                <p>{issue.verificationResult.aiExplanation}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
