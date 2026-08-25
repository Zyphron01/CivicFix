"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AdminNavbar } from "@/components/admin/AdminNavbar";
import { CivicIssue } from "@/types/civic";
import { civicService } from "@/services/civicService";
import { IssueStatusBadge } from "@/components/civic/IssueStatusBadge";
import { PriorityBadge } from "@/components/civic/PriorityBadge";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function AdminMapPage() {
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<CivicIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError(null);
        const data = await civicService.getIssues();
        if (mounted) {
          setIssues(data || []);
          if (data && data.length > 0) {
            setSelectedIssue(data[0]);
          }
        }
      } catch (err: any) {
        console.error("Error loading spatial intelligence map:", err);
        if (mounted) {
          setError(err.message || "Failed to load spatial map.");
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

  return (
    <RouteGuard allowedRoles={["MUNICIPAL_ADMIN"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <AdminNavbar />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Spatial Ward Intelligence</h1>
              <p className="text-sm text-slate-400 mt-1">
                Geographic issue cluster map, ward boundary routing, and density simulation.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 text-red-300 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-slate-500">Loading spatial intelligence...</div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Spatial View Area */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 relative min-h-[500px] flex flex-col justify-between overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]"></div>
                
                <div className="relative z-10 flex justify-between items-center bg-slate-950/80 p-4 rounded-xl border border-slate-800">
                  <span className="text-xs font-mono text-blue-400">SPATIAL GRID • MUNICIPAL WARD CLUSTERS</span>
                  <span className="text-xs px-2.5 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full font-bold">
                    {issues.length} Active Spatial Markers
                  </span>
                </div>

                {/* Spatial Marker Pins */}
                <div className="relative z-10 grid sm:grid-cols-2 gap-4 my-auto py-8">
                  {issues.map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() => setSelectedIssue(issue)}
                      className={`text-left p-4 rounded-xl border transition-all flex items-center justify-between ${
                        selectedIssue?.id === issue.id
                          ? "border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/20"
                          : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{issue.wardId || "N/A"}</span>
                        <p className="font-bold text-sm text-white line-clamp-1">{issue.canonicalTitle || "Untitled Issue"}</p>
                        <p className="text-xs text-slate-400">{issue.category || "OTHER"}</p>
                      </div>
                      <PriorityBadge level={issue.priorityLevel || "LOW"} score={issue.priorityScore ?? 0} />
                    </button>
                  ))}
                </div>

                <div className="relative z-10 text-xs text-slate-500 text-center pt-4 border-t border-slate-800">
                  Spatial clustering operational.
                </div>
              </div>

              {/* Selected Pin Detail Sidebar */}
              <div className="space-y-6">
                {selectedIssue ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 sticky top-20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-400">{selectedIssue.id}</span>
                      <IssueStatusBadge status={selectedIssue.status} />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-white">{selectedIssue.canonicalTitle || "Untitled Issue"}</h3>
                      <p className="text-xs text-slate-400">{selectedIssue.addressText || "Address recorded"}</p>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-slate-800 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Category:</span>
                        <span className="font-bold text-white">{selectedIssue.category || "OTHER"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Ward:</span>
                        <span className="font-bold text-white">{selectedIssue.wardId || "N/A"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Priority Score:</span>
                        <span className="font-bold text-blue-400">{selectedIssue.priorityScore ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Cluster Reports:</span>
                        <span className="font-bold text-white">{selectedIssue.reportCount ?? 1}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                      <Link
                        href={`/admin/issues/${selectedIssue.id}`}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-colors shadow-md block text-center"
                      >
                        Open Admin Triage Review →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">
                    Select a marker to view spatial cluster details.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </RouteGuard>
  );
}
