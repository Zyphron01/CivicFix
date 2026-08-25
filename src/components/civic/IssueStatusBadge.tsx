import React from "react";
import { IssueStatus } from "@/types/civic";

interface Props {
  status: IssueStatus;
}

const statusConfig: Record<IssueStatus, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-blue-100 text-blue-800 border-blue-200" },
  TRIAGED: { label: "AI Triaged", className: "bg-purple-100 text-purple-800 border-purple-200" },
  ROUTED_TO_DEPARTMENT: { label: "Routed to Department", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  ACCEPTED_BY_DEPARTMENT: { label: "Accepted by Dept", className: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  ASSIGNED: { label: "Assigned", className: "bg-amber-100 text-amber-800 border-amber-200" },
  IN_PROGRESS: { label: "In Progress", className: "bg-orange-100 text-orange-800 border-orange-200" },
  ACTIONED: { label: "Actioned", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  VERIFICATION: { label: "Verification Pending", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  RESOLVED: { label: "Resolved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  CLOSED: { label: "Closed", className: "bg-slate-100 text-slate-800 border-slate-200" },
  REOPENED: { label: "Reopened", className: "bg-rose-100 text-rose-800 border-rose-200" },
};

export function IssueStatusBadge({ status }: Props) {
  const config = statusConfig[status] || { label: status, className: "bg-slate-100 text-slate-800 border-slate-200" };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.className}`}
    >
      {config.label}
    </span>
  );
}
