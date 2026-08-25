export type AICategory =
  | "POTHOLE"
  | "GARBAGE"
  | "DRAINAGE"
  | "STREETLIGHT"
  | "WATER_LEAKAGE"
  | "OTHER";

export type AISeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AIUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AIImpact = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AIPriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AITriageAssessment {
  id?: string;
  issueId: string;
  category: AICategory;
  severity: AISeverity;
  urgency: AIUrgency;
  impact: AIImpact;
  priorityScore: number; // 0-100
  priorityLevel: AIPriorityLevel;
  reasoning: string;
  recommendedDepartment: string;
  workSummary: string;
  isCivicIssue: boolean;
  hazardClassification: string;
  confidenceScore: number; // 0.0 - 1.0
  inJurisdiction: boolean;
  model?: string;
  provider?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AITriageInput {
  title: string;
  description: string;
  category: AICategory;
  latitude: number;
  longitude: number;
  addressText: string;
  wardId: string;
  imageUrl?: string;
  reportCount?: number;
}

export interface AITriageService {
  assess(input: AITriageInput): Promise<AITriageAssessment>;
}