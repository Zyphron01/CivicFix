import { ModerationStatus } from "@/types/civic";

export function extractModerationFromHistory(
  row: any,
  historyRows: any[]
): {
  moderationStatus: ModerationStatus;
  moderationReason?: string;
  moderatedAt?: string;
  moderatedBy?: string;
} {
  // 1. If row already has explicit column value from DDL
  if (row.moderation_status && ["ACTIVE", "UNDER_REVIEW", "SUSPICIOUS", "REJECTED", "ARCHIVED"].includes(row.moderation_status)) {
    return {
      moderationStatus: row.moderation_status as ModerationStatus,
      moderationReason: row.moderation_reason || undefined,
      moderatedAt: row.moderated_at || undefined,
      moderatedBy: row.moderated_by || undefined,
    };
  }

  // 2. Authoritative extraction from status_history audit log
  const modEvents = (historyRows || [])
    .filter((h: any) => h.comment && h.comment.startsWith("MODERATION CHANGE:"))
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (modEvents.length > 0) {
    const latest = modEvents[0];
    const match = latest.comment.match(/MODERATION CHANGE:\s*\[[^\]]+\]\s*->\s*\[([^\]]+)\]/);
    if (match) {
      const extractedStatus = match[1].trim().toUpperCase() as ModerationStatus;
      if (["ACTIVE", "UNDER_REVIEW", "SUSPICIOUS", "REJECTED", "ARCHIVED"].includes(extractedStatus)) {
        const reasonMatch = latest.comment.match(/\(Reason:\s*([^)]+)\)/);
        return {
          moderationStatus: extractedStatus,
          moderationReason: reasonMatch ? reasonMatch[1].trim() : undefined,
          moderatedAt: latest.timestamp,
          moderatedBy: latest.changed_by || undefined,
        };
      }
    }
  }

  return {
    moderationStatus: "ACTIVE",
  };
}
