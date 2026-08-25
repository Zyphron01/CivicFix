import React from "react";
import { PriorityLevel } from "@/types/civic";

interface Props {
  level: PriorityLevel;
  score?: number;
}

const priorityConfig: Record<PriorityLevel, { label: string; className: string }> = {
  LOW: { label: "Low Priority", className: "bg-slate-100 text-slate-700 border-slate-300" },
  MEDIUM: { label: "Medium Priority", className: "bg-blue-50 text-blue-700 border-blue-200" },
  HIGH: { label: "High Priority", className: "bg-amber-50 text-amber-800 border-amber-300" },
  CRITICAL: { label: "Critical Priority", className: "bg-red-50 text-red-700 border-red-200 animate-pulse" },
};

export function PriorityBadge({ level, score }: Props) {
  const config = priorityConfig[level] || { label: level, className: "bg-slate-100 text-slate-800 border-slate-200" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
      {config.label} {score !== undefined ? `(${score})` : ""}
    </span>
  );
}
