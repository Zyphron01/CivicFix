import React from "react";
import Link from "next/link";
import { CivicIssue } from "@/types/civic";
import { IssueStatusBadge } from "./IssueStatusBadge";
import { PriorityBadge } from "./PriorityBadge";

interface Props {
  issue: CivicIssue;
}

export function IssueCard({ issue }: Props) {
  if (!issue) return null;

  const description =
    (issue.reports && issue.reports[0]?.description) ||
    issue.addressText ||
    "Civic infrastructure report";

  let submittedDate = "Recently";
  if (issue.createdAt) {
    try {
      const d = new Date(issue.createdAt);
      if (!isNaN(d.getTime())) {
        submittedDate = d.toLocaleDateString();
      }
    } catch {
      submittedDate = "Recently";
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-slate-500 uppercase">{issue.id}</span>
          <IssueStatusBadge status={issue.status} />
        </div>

        <h3 className="text-lg font-bold text-slate-900 line-clamp-1">{issue.canonicalTitle || "Untitled Issue"}</h3>
        <p className="text-sm text-slate-600 line-clamp-2">{description}</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <PriorityBadge level={issue.priorityLevel || "LOW"} score={issue.priorityScore ?? 0} />
          <span className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-md font-medium">
            Ward: {issue.wardId || "N/A"}
          </span>
          <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-md font-medium">
            {issue.category || "OTHER"}
          </span>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-400">Submitted: {submittedDate}</span>
        <Link
          href={`/issues/${issue.id}`}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          View Tracking →
        </Link>
      </div>
    </div>
  );
}
