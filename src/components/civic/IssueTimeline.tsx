import React from "react";
import { IssueStatus, StatusHistory } from "@/types/civic";

interface Props {
  currentStatus: IssueStatus;
  statusHistory: StatusHistory[];
}

const FLOW_STEPS: { status: IssueStatus; label: string }[] = [
  { status: "SUBMITTED", label: "Submitted" },
  { status: "TRIAGED", label: "AI Triaged" },
  { status: "ASSIGNED", label: "Assigned" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "ACTIONED", label: "Actioned" },
  { status: "VERIFICATION", label: "Verification" },
  { status: "RESOLVED", label: "Resolved" },
];

const statusOrder: IssueStatus[] = [
  "SUBMITTED",
  "TRIAGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "ACTIONED",
  "VERIFICATION",
  "RESOLVED",
  "REOPENED",
];

export function IssueTimeline({ currentStatus, statusHistory }: Props) {
  const currentIndex = statusOrder.indexOf(currentStatus);

  return (
    <div className="space-y-6">
      <div className="relative flex items-center justify-between max-w-3xl mx-auto px-4">
        {FLOW_STEPS.map((step, idx) => {
          const stepIndex = statusOrder.indexOf(step.status);
          const isCompleted = currentIndex >= stepIndex || currentStatus === "RESOLVED";
          const isCurrent = currentStatus === step.status;

          return (
            <div key={step.status} className="flex flex-col items-center relative z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  isCurrent
                    ? "bg-blue-600 text-white ring-4 ring-blue-100 shadow-md"
                    : isCompleted
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {idx + 1}
              </div>
              <span
                className={`text-xs mt-2 font-medium text-center ${
                  isCurrent ? "text-blue-700 font-bold" : isCompleted ? "text-slate-800" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Status Audit History</h4>
        <div className="space-y-3">
          {statusHistory.map((h) => (
            <div key={h.id} className="flex items-start justify-between text-xs border-b border-slate-200 pb-2 last:border-0 last:pb-0">
              <div>
                <span className="font-semibold text-slate-800">{h.newStatus}</span>
                {h.comment && <p className="text-slate-600 mt-0.5">{h.comment}</p>}
                <span className="text-[10px] text-slate-400">By: {h.changedBy}</span>
              </div>
              <span className="text-slate-400">{new Date(h.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
