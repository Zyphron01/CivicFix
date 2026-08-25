import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { civicService } from "@/services/civicService";
import { IssueCard } from "@/components/civic/IssueCard";

async function getPublicStats() {
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data: rows } = await supabaseAdmin.from("issues").select("status, priority_level");
    if (rows) {
      return {
        totalIssues: rows.length,
        resolvedIssues: rows.filter((i) => i.status === "RESOLVED").length,
        pendingVerification: rows.filter((i) => i.status === "VERIFICATION").length,
        criticalIssues: rows.filter((i) => i.priority_level === "CRITICAL").length,
        averageResolutionDays: 2.4,
      };
    }
  } catch {
    // fallback
  }
  return civicService.getDashboardStats();
}

export default async function Home() {
  const stats = await getPublicStats();
  const issues = await civicService.getIssues();
  const recentIssues = issues.slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-blue-900 to-blue-800 text-white py-16 px-4">
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-700 text-blue-100 border border-blue-600">
              Civic Intelligence & Verified Resolution
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              Real resolution, <span className="text-blue-300">not just ticket closure.</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-blue-100">
              CivicFix uses AI issue classification, spatial deduplication, and verifiable field evidence to ensure physical civic problems are truly resolved.
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <Link
                href="/report"
                className="px-8 py-3 bg-white text-blue-900 rounded-xl font-bold hover:bg-blue-50 transition-colors shadow-lg"
              >
                Report an Issue
              </Link>
              <Link
                href="/my-reports"
                className="px-8 py-3 bg-blue-700 text-white rounded-xl font-bold hover:bg-blue-600 transition-colors border border-blue-600"
              >
                Track My Reports
              </Link>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-2 text-center sm:text-left sm:flex sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-blue-700">City-Wide Public Impact Metrics</h2>
              <p className="text-xs text-slate-500 mt-0.5">Aggregated platform statistics across all municipal wards</p>
            </div>
            <span className="inline-block mt-2 sm:mt-0 text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
              Public Platform Data
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center">
              <p className="text-3xl font-extrabold text-blue-600">{stats.totalIssues}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Platform Total Issues</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center">
              <p className="text-3xl font-extrabold text-emerald-600">{stats.resolvedIssues}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">City Verified Resolved</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center">
              <p className="text-3xl font-extrabold text-amber-600">{stats.pendingVerification}</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Pending Verification</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center">
              <p className="text-3xl font-extrabold text-purple-600">{stats.averageResolutionDays} days</p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">City Avg Resolution</p>
            </div>
          </div>
        </section>

        {/* Workflow Summary */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
            <h2 className="text-2xl font-bold text-slate-900">The CivicFix Lifecycle</h2>
            <p className="text-slate-600 text-sm">
              From citizen report to AI-assisted verification and closure.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
                1
              </div>
              <h3 className="font-bold text-slate-900">AI Triage & Spatial Routing</h3>
              <p className="text-sm text-slate-600">
                Reports are automatically categorized, scored for priority, clustered to eliminate duplicates, and routed to the correct ward department.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
                2
              </div>
              <h3 className="font-bold text-slate-900">Field Action & Evidence</h3>
              <p className="text-sm text-slate-600">
                Assigned field workers resolve the civic issue on site and upload mandatory before-and-after photographic evidence.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                3
              </div>
              <h3 className="font-bold text-slate-900">Verified Closure</h3>
              <p className="text-sm text-slate-600">
                AI visual validation compares before/after evidence while citizens retain the right to accept or reopen the ticket.
              </p>
            </div>
          </div>
        </section>

        {/* Recent Issues Feed */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Recent Civic Reports</h2>
            <Link href="/my-reports" className="text-sm font-semibold text-blue-600 hover:text-blue-800">
              View All Reports →
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {recentIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 text-center text-xs text-slate-500">
        CivicFix Platform • Built for Verified Real-World Resolution
      </footer>
    </div>
  );
}
