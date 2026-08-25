"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AdminNavbar } from "@/components/admin/AdminNavbar";
import { CivicIssue, DashboardStats } from "@/types/civic";
import { civicService } from "@/services/civicService";
import { IssueStatusBadge } from "@/components/civic/IssueStatusBadge";
import { PriorityBadge } from "@/components/civic/PriorityBadge";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError(null);
        // Parallelize stats and issues fetching
        const [s, all] = await Promise.all([
          civicService.getDashboardStats(),
          civicService.getIssues(),
        ]);

        if (mounted) {
          setStats(s);
          setIssues(all || []);
        }
      } catch (err: any) {
        console.error("Error loading admin dashboard data:", err);
        if (mounted) {
          setError(err.message || "Failed to load command center data.");
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
  }, []);

  const requiresAttention = issues.filter(
    (i) => i && (i.status === "SUBMITTED" || i.priorityLevel === "CRITICAL" || i.priorityLevel === "HIGH")
  );

  const underReviewCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "UNDER_REVIEW").length;
  const suspiciousCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "SUSPICIOUS").length;
  const rejectedCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "REJECTED").length;
  const operationalCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "ACTIVE").length;

  return (
    <RouteGuard allowedRoles={["MUNICIPAL_ADMIN"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <AdminNavbar />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Command Center</h1>
              <p className="text-sm text-slate-400 mt-1">
                AI-assisted civic issue triage, departmental routing, and operational oversight.
              </p>
            </div>
            <Link
              href="/admin/issues"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors shadow-sm self-start"
            >
              Manage Triage Queue →
            </Link>
          </div>

          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 text-red-300 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {loading || !stats ? (
            <div className="py-20 text-center text-slate-500">Loading operations console...</div>
          ) : (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                  <p className="text-3xl font-black text-white">{stats.totalIssues ?? 0}</p>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Total Active Issues</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                  <p className="text-3xl font-black text-red-400">{stats.criticalIssues ?? 0}</p>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Critical / High Priority</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                  <p className="text-3xl font-black text-amber-400">{stats.pendingVerification ?? 0}</p>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Pending Verification</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                  <p className="text-3xl font-black text-emerald-400">{stats.resolvedIssues ?? 0}</p>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Resolved & Closed</p>
                </div>
              </div>

              {/* Moderation Health Breakdown Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                  🛡️ Moderation Health & Queues:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/admin/issues?tab=OPERATIONAL"
                    className="px-3 py-1.5 bg-blue-950/70 hover:bg-blue-900/70 border border-blue-800/80 text-blue-300 rounded-xl font-bold transition-colors"
                  >
                    ⚡ Operational ({operationalCount})
                  </Link>
                  <Link
                    href="/admin/issues?tab=UNDER_REVIEW"
                    className="px-3 py-1.5 bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-800/80 text-indigo-300 rounded-xl font-bold transition-colors"
                  >
                    🔍 Under Review ({underReviewCount})
                  </Link>
                  <Link
                    href="/admin/issues?tab=SUSPICIOUS"
                    className="px-3 py-1.5 bg-amber-950/70 hover:bg-amber-900/70 border border-amber-800/80 text-amber-300 rounded-xl font-bold transition-colors"
                  >
                    ⚠️ Suspicious ({suspiciousCount})
                  </Link>
                  <Link
                    href="/admin/issues?tab=REJECTED"
                    className="px-3 py-1.5 bg-red-950/70 hover:bg-red-900/70 border border-red-800/80 text-red-300 rounded-xl font-bold transition-colors"
                  >
                    🚫 Rejected ({rejectedCount})
                  </Link>
                </div>
              </div>

              {/* Requires Attention Queue */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Requires Attention</h2>
                    <p className="text-xs text-slate-400 mt-0.5">High priority or unassigned issues needing immediate triage.</p>
                  </div>
                  <Link href="/admin/issues" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                    View Full Queue ({issues.length})
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 pr-4">ID</th>
                        <th className="pb-3 px-4">Title & Category</th>
                        <th className="pb-3 px-4">Priority</th>
                        <th className="pb-3 px-4">Ward / Dept</th>
                        <th className="pb-3 px-4">Status</th>
                        <th className="pb-3 pl-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                      {requiresAttention.slice(0, 5).map((issue) => (
                        <tr key={issue.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-4 pr-4 font-mono text-xs text-slate-400">{issue.id}</td>
                          <td className="py-4 px-4">
                            <p className="font-bold text-white line-clamp-1">{issue.canonicalTitle || "Untitled Issue"}</p>
                            <p className="text-xs text-slate-400">{issue.category || "OTHER"}</p>
                          </td>
                          <td className="py-4 px-4">
                            <PriorityBadge level={issue.priorityLevel || "LOW"} score={issue.priorityScore ?? 0} />
                          </td>
                          <td className="py-4 px-4 text-xs">
                            <span className="font-medium text-slate-300">{issue.wardId || "N/A"}</span>
                            <p className="text-slate-500">{issue.departmentId || "Unassigned"}</p>
                          </td>
                          <td className="py-4 px-4">
                            <IssueStatusBadge status={issue.status} />
                          </td>
                          <td className="py-4 pl-4 text-right">
                            <Link
                              href={`/admin/issues/${issue.id}`}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm inline-block"
                            >
                              Review →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </RouteGuard>
  );
}
