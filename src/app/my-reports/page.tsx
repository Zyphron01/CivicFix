"use client";

import React, { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { CivicIssue } from "@/types/civic";
import { civicService } from "@/services/civicService";
import { IssueCard } from "@/components/civic/IssueCard";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function MyReportsPage() {
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED" | "REOPENED">("ALL");
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
        }
      } catch (err: any) {
        console.error("Error loading issues in MyReports:", err);
        if (mounted) {
          setError(err.message || "Failed to load tracked reports.");
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

  const filteredIssues = issues.filter((issue) => {
    if (!issue) return false;
    if (filter === "ACTIVE") return issue.status !== "RESOLVED";
    if (filter === "RESOLVED") return issue.status === "RESOLVED";
    if (filter === "REOPENED") return issue.status === "REOPENED";
    return true;
  });

  return (
    <RouteGuard requireAuth={true}>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Navbar />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900">My Tracked Reports</h1>
              <p className="text-sm text-slate-600 mt-1">
                Monitor real-time status updates, audit history, and verification evidence for your submitted issues.
              </p>
            </div>

            <div className="flex bg-slate-200 p-1 rounded-xl">
              {(["ALL", "ACTIVE", "RESOLVED", "REOPENED"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    filter === tab ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-slate-500">Loading your civic reports...</div>
          ) : filteredIssues.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4">
              <h3 className="text-lg font-bold text-slate-800">No reports found for this filter</h3>
              <p className="text-sm text-slate-600">Submit a new civic issue to start tracking.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredIssues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </main>
      </div>
    </RouteGuard>
  );
}
