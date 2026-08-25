"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminNavbar } from "@/components/admin/AdminNavbar";
import { CivicIssue } from "@/types/civic";
import { civicService } from "@/services/civicService";
import { IssueStatusBadge } from "@/components/civic/IssueStatusBadge";
import { PriorityBadge } from "@/components/civic/PriorityBadge";
import { RouteGuard } from "@/components/auth/RouteGuard";

function AdminIssuesQueueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("tab") || "OPERATIONAL";

  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [moderationFilter, setModerationFilter] = useState<string>(initialTab);

  useEffect(() => {
    const tab = searchParams?.get("tab") || "OPERATIONAL";
    setModerationFilter(tab);
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError(null);
        const data = await civicService.getIssues();
        if (mounted) {
          setIssues(data || []);
        }
      } catch (err: any) {
        console.error("Error loading issues in AdminIssuesPage:", err);
        if (mounted) {
          setError(err.message || "Failed to load triage queue.");
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

  const handleTabChange = (tabId: string) => {
    setModerationFilter(tabId);
    const newUrl = tabId === "OPERATIONAL" ? "/admin/issues" : `/admin/issues?tab=${tabId}`;
    router.replace(newUrl);
  };

  // Dynamic counts for each moderation category (strictly isolated per queue rules)
  const operationalCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "ACTIVE").length;
  const underReviewCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "UNDER_REVIEW").length;
  const suspiciousCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "SUSPICIOUS").length;
  const rejectedCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "REJECTED").length;
  const archivedCount = issues.filter((i) => (i.moderationStatus || "ACTIVE") === "ARCHIVED").length;
  const allCount = issues.length;

  const filteredIssues = issues.filter((issue) => {
    if (!issue) return false;

    const idStr = (issue.id || "").toLowerCase();
    const titleStr = (issue.canonicalTitle || "").toLowerCase();
    const addrStr = (issue.addressText || "").toLowerCase();
    const q = search.toLowerCase().trim();

    const matchesSearch = !q || idStr.includes(q) || titleStr.includes(q) || addrStr.includes(q);
    const matchesStatus = statusFilter === "ALL" || issue.status === statusFilter;
    const matchesCategory = categoryFilter === "ALL" || issue.category === categoryFilter;
    const matchesPriority = priorityFilter === "ALL" || issue.priorityLevel === priorityFilter;

    // Strict Moderation Filter logic
    const modStatus = issue.moderationStatus || "ACTIVE";
    let matchesModeration = true;
    if (moderationFilter === "OPERATIONAL") {
      matchesModeration = modStatus === "ACTIVE";
    } else if (moderationFilter !== "ALL") {
      matchesModeration = modStatus === moderationFilter;
    }

    return matchesSearch && matchesStatus && matchesCategory && matchesPriority && matchesModeration;
  });

  return (
    <RouteGuard allowedRoles={["MUNICIPAL_ADMIN"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <AdminNavbar />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Issue Triage & Moderation Queue</h1>
              <p className="text-sm text-slate-400 mt-1">
                Filter, moderate, and route AI-triaged municipal civic reports with full audit accountability.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 text-red-300 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {/* Moderation Status Filter Tabs with Live Dynamic Counters */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1">
            {[
              { id: "OPERATIONAL", label: "⚡ Operational Queue", count: operationalCount, color: "blue" },
              { id: "UNDER_REVIEW", label: "🔍 Under Review", count: underReviewCount, color: "indigo" },
              { id: "SUSPICIOUS", label: "⚠️ Suspicious Reports", count: suspiciousCount, color: "amber" },
              { id: "REJECTED", label: "🚫 Rejected Archive", count: rejectedCount, color: "red" },
              { id: "ARCHIVED", label: "📦 Archived Records", count: archivedCount, color: "slate" },
              { id: "ALL", label: "🌐 Master Audit", count: allCount, color: "slate" },
            ].map((tab) => {
              const isActive = moderationFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center space-x-2 ${
                    isActive
                      ? "bg-blue-600 text-white border-blue-500 shadow-md ring-2 ring-blue-500/20"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filters and Search */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="grid sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Search Issue</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search ID, title, address..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Operational Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="ROUTED_TO_DEPARTMENT">Routed to Dept</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="VERIFICATION">Verification</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="POTHOLE">Pothole</option>
                  <option value="GARBAGE">Garbage</option>
                  <option value="DRAINAGE">Drainage</option>
                  <option value="STREETLIGHT">Streetlight</option>
                  <option value="WATER_LEAKAGE">Water Leakage</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Priority Level</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Issue Table */}
          {loading ? (
            <div className="py-20 text-center text-slate-500">Loading triage queue records...</div>
          ) : filteredIssues.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <h3 className="text-lg font-bold text-white">No reports found in {moderationFilter} queue</h3>
              <p className="text-sm text-slate-400">
                {moderationFilter === "SUSPICIOUS"
                  ? "Zero reports currently flagged as suspicious."
                  : moderationFilter === "REJECTED"
                  ? "Zero reports currently rejected in archive."
                  : moderationFilter === "UNDER_REVIEW"
                  ? "Zero reports awaiting administrative review."
                  : "Try adjusting your filters or search query."}
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/50">
                      <th className="py-4 px-6">ID & Date</th>
                      <th className="py-4 px-6">Issue Details</th>
                      <th className="py-4 px-6">Moderation State</th>
                      <th className="py-4 px-6">Priority</th>
                      <th className="py-4 px-6">Ward & Dept</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-sm">
                    {filteredIssues.map((issue) => {
                      let dateStr = "Recent";
                      if (issue.createdAt) {
                        try {
                          const d = new Date(issue.createdAt);
                          if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString();
                        } catch {
                          dateStr = "Recent";
                        }
                      }

                      const modStatus = issue.moderationStatus || "ACTIVE";

                      return (
                        <tr key={issue.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-4 px-6 font-mono text-xs text-slate-400">
                            <span className="font-bold text-white">{issue.id}</span>
                            <p className="text-[10px] text-slate-500 mt-0.5">{dateStr}</p>
                          </td>
                          <td className="py-4 px-6 max-w-xs">
                            <p className="font-bold text-white line-clamp-1">{issue.canonicalTitle || "Untitled Issue"}</p>
                            <p className="text-xs text-slate-400 truncate">{issue.category || "OTHER"} • {issue.addressText || "Address logged"}</p>
                            {issue.moderationReason && modStatus === "REJECTED" && (
                              <p className="text-[11px] text-red-400 font-medium truncate mt-1">
                                Reason: {issue.moderationReason}
                              </p>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
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
                          </td>
                          <td className="py-4 px-6">
                            <PriorityBadge level={issue.priorityLevel || "LOW"} score={issue.priorityScore ?? 0} />
                          </td>
                          <td className="py-4 px-6 text-xs">
                            <span className="font-semibold text-slate-300">{issue.wardId || "N/A"}</span>
                            <p className="text-slate-500">{issue.departmentId || "Unassigned"}</p>
                          </td>
                          <td className="py-4 px-6">
                            <IssueStatusBadge status={issue.status} />
                          </td>
                          <td className="py-4 px-6 text-right">
                            <Link
                              href={`/admin/issues/${issue.id}`}
                              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm inline-block"
                            >
                              Inspect & Triage →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </RouteGuard>
  );
}

export default function AdminIssuesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">
          Loading triage queue...
        </div>
      }
    >
      <AdminIssuesQueueContent />
    </Suspense>
  );
}
