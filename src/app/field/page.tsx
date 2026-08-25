"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FieldNavbar } from "@/components/field/FieldNavbar";
import { CivicIssue } from "@/types/civic";
import { civicService } from "@/services/civicService";
import { IssueStatusBadge } from "@/components/civic/IssueStatusBadge";
import { PriorityBadge } from "@/components/civic/PriorityBadge";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { useAuth } from "@/context/AuthContext";
import { getSLAStatus, calculateWorkloadCapacity } from "@/services/supabaseCivicService";

export default function FieldWorkerPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError(null);
        const all = civicService.getFieldTasks ? await civicService.getFieldTasks() : await civicService.getIssues();
        if (mounted) {
          setIssues(all || []);
        }
      } catch (err: any) {
        console.error("Error loading field issues:", err);
        if (mounted) {
          setError(err.message || "Failed to load field tasks.");
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

  const [statusFilter, setStatusFilter] = useState<"ALL" | "NEWLY_ROUTED" | "IN_PROGRESS" | "VERIFICATION" | "COMPLETED">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");

  const filteredIssues = issues.filter((i) => {
    if (!i) return false;
    if (i.moderationStatus === "REJECTED" || i.moderationStatus === "ARCHIVED") return false;
    
    // Status Lifecycle Filter
    if (statusFilter === "NEWLY_ROUTED" && !(i.status === "ROUTED_TO_DEPARTMENT" || i.status === "ASSIGNED")) return false;
    if (statusFilter === "IN_PROGRESS" && i.status !== "IN_PROGRESS") return false;
    if (statusFilter === "VERIFICATION" && !(i.status === "VERIFICATION" || (i as any).status === "WORK_COMPLETED")) return false;
    if (statusFilter === "COMPLETED" && !(i.status === "RESOLVED" || i.status === "CLOSED")) return false;

    // Priority Filter
    if (priorityFilter === "HIGH" && !(i.priorityLevel === "CRITICAL" || i.priorityLevel === "HIGH" || (i.priorityScore ?? 0) >= 60)) return false;
    if (priorityFilter === "MEDIUM" && !(i.priorityLevel === "MEDIUM" || ((i.priorityScore ?? 0) >= 40 && (i.priorityScore ?? 0) < 60))) return false;
    if (priorityFilter === "LOW" && !(i.priorityLevel === "LOW" || (i.priorityScore ?? 0) < 40)) return false;

    return true;
  });

  const teamLeadCapacity = calculateWorkloadCapacity(filteredIssues.length);

  return (
    <RouteGuard allowedRoles={["FIELD_WORKER"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <FieldNavbar />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Field Operations Task Queue</h1>
              <p className="text-sm text-slate-400 mt-1">
                Assigned civic infrastructure issues requiring on-site action and photographic resolution evidence.
              </p>
            </div>
            
            {/* Team Lead Supervisory Workload Indicator */}
            <div className="p-3.5 bg-purple-950/40 border border-purple-800/60 rounded-2xl flex items-center space-x-3 text-xs">
              <span className="text-xl">🛡️</span>
              <div>
                <span className="font-bold text-purple-300 block uppercase text-[10px] tracking-wider">Supervisory Crew Capacity</span>
                <span className="text-slate-200 font-bold">{teamLeadCapacity.label}</span>
              </div>
            </div>
          </div>

          {/* Operational Task Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            {/* Status Lifecycle Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "ALL" ? "bg-emerald-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                All Tasks ({issues.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("NEWLY_ROUTED")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "NEWLY_ROUTED" ? "bg-blue-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                Newly Assigned / Routed
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("IN_PROGRESS")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "IN_PROGRESS" ? "bg-amber-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                In Progress
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("VERIFICATION")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "VERIFICATION" ? "bg-purple-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                Verification Pending
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("COMPLETED")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === "COMPLETED" ? "bg-slate-700 text-white" : "bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                Completed
              </button>
            </div>

            {/* Priority Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400 uppercase">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 text-red-300 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-slate-500">Loading assigned tasks...</div>
          ) : filteredIssues.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <h3 className="text-lg font-bold text-white">No matching tasks found</h3>
              <p className="text-sm text-slate-400">Try adjusting your status or priority filter options above.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredIssues.map((issue) => {
                const sla = getSLAStatus(issue.assignment?.targetResolutionDate);
                return (
                  <div
                    key={issue.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-medium text-slate-400 uppercase">{issue.id}</span>
                        <IssueStatusBadge status={issue.status} />
                      </div>

                      <h3 className="text-lg font-bold text-white line-clamp-1">{issue.canonicalTitle || "Untitled Task"}</h3>
                      <p className="text-sm text-slate-400 line-clamp-2">{issue.addressText || "Location recorded"}</p>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <PriorityBadge level={issue.priorityLevel || "LOW"} score={issue.priorityScore ?? 0} />
                        <span className={`text-xs px-2.5 py-1 rounded-md font-bold border ${
                          sla.status === "OVERDUE" ? "bg-red-950 text-red-300 border-red-800" :
                          sla.status === "DUE_SOON" ? "bg-amber-950 text-amber-300 border-amber-800" :
                          sla.status === "ON_TRACK" ? "bg-emerald-950 text-emerald-300 border-emerald-800" :
                          "bg-slate-800 text-slate-300 border-slate-700"
                        }`}>
                          ⏱️ {sla.label}
                        </span>
                      </div>
                    </div>

                      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-400">Dept: {issue.departmentId || "General"}</span>
                        <Link
                          href={`/field/issues/${issue.id}`}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                        >
                          Open Task →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </RouteGuard>
    );
  }
