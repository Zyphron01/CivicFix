export type IssueStatus =
  | "SUBMITTED"
  | "TRIAGED"
  | "ROUTED_TO_DEPARTMENT"
  | "ACCEPTED_BY_DEPARTMENT"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "ACTIONED"
  | "VERIFICATION"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";

export type IssueCategory =
  | "POTHOLE"
  | "GARBAGE"
  | "DRAINAGE"
  | "STREETLIGHT"
  | "WATER_LEAKAGE"
  | "OTHER";

export type VerificationStatus =
  | "PENDING"
  | "AI_VERIFIED"
  | "CITIZEN_ACCEPTED"
  | "REJECTED";

export type PriorityLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type UserRole = "CITIZEN" | "MUNICIPAL_ADMIN" | "FIELD_WORKER";

export interface UserProfile {
  id: string;
  fullName: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  wardId?: string;
  departmentId?: string;
}

export interface Ward {
  id: string;
  name: string;
  code: string;
  boundaryPolygon?: [number, number][];
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string;
}

export type ModerationStatus =
  | "ACTIVE"
  | "UNDER_REVIEW"
  | "SUSPICIOUS"
  | "REJECTED"
  | "ARCHIVED";

export type LocationSource = "LIVE_PRECISE_DEVICE" | "MANUAL_MAP_SELECTION";

export interface ModerationAuditEntry {
  id: string;
  issueId: string;
  previousModerationStatus?: ModerationStatus;
  newModerationStatus: ModerationStatus;
  moderatedBy: string;
  reason?: string;
  timestamp: string;
}

export interface Report {
  id: string;
  issueId: string;
  citizenId: string;
  description: string;
  imageUrl?: string;
  latitude: number;
  longitude: number;
  wardId: string;
  locationSource?: LocationSource;
  locationAccuracy?: number;
  createdAt: string;
}

export type AssignmentTargetType = "INDIVIDUAL" | "TEAM";

export type WorkloadLevel = "LIGHT" | "OPTIMAL" | "HIGH_LOAD";

export interface WorkloadCapacity {
  level: WorkloadLevel;
  activeTaskCount: number;
  label: string;
}

export type SLAStatus = "OVERDUE" | "DUE_SOON" | "ON_TRACK" | "NO_DEADLINE";

export interface SLAMetrics {
  status: SLAStatus;
  hoursRemaining: number | null;
  targetDateFormatted: string | null;
  label: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  specialization: string;
  isActive: boolean;
  leadWorkerId?: string;
  createdAt?: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  workerId: string;
  role: "LEAD" | "MEMBER";
  createdAt?: string;
}

export interface Assignment {
  id: string;
  issueId: string;
  departmentId: string;
  targetType?: AssignmentTargetType;
  fieldWorkerId?: string;
  teamId?: string;
  assignedAt: string;
  targetResolutionDate: string;
  notes?: string;
  isActive?: boolean;
  supersededAt?: string;
  supersededByAssignmentId?: string;
}

export interface StatusHistory {
  id: string;
  issueId: string;
  previousStatus?: IssueStatus;
  newStatus: IssueStatus;
  changedBy: string;
  comment?: string;
  timestamp: string;
}

export interface ResolutionEvidence {
  id: string;
  issueId: string;
  fieldWorkerId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  workSummary: string;
  submittedAt: string;
}

export interface VerificationResult {
  id: string;
  issueId: string;
  aiConfidenceScore: number;
  aiMatchDetected: boolean;
  aiExplanation: string;
  verifiedAt: string;
}

import type { AITriageAssessment } from "./ai";
export type { AITriageAssessment };

export interface CivicIssue {
  id: string;
  canonicalTitle: string;
  category: IssueCategory;
  status: IssueStatus;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  wardId: string;
  departmentId?: string;
  latitude: number;
  longitude: number;
  addressText: string;
  locationSource?: LocationSource;
  locationAccuracy?: number;
  moderationStatus?: ModerationStatus;
  moderationReason?: string;
  moderatedAt?: string;
  moderatedBy?: string;
  reportCount: number;
  reports: Report[];
  assignment?: Assignment;
  statusHistory: StatusHistory[];
  resolutionEvidence?: ResolutionEvidence;
  verificationResult?: VerificationResult;
  aiAssessment?: AITriageAssessment;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalIssues: number;
  resolvedIssues: number;
  pendingVerification: number;
  criticalIssues: number;
  averageResolutionDays: number;
}

export interface CreateReportInput {
  citizenId: string;
  title: string;
  description: string;
  category: IssueCategory;
  latitude: number;
  longitude: number;
  addressText: string;
  wardId: string;
  imageUrl?: string;
  locationSource?: LocationSource;
  locationAccuracy?: number;
  aiAssessment?: AITriageAssessment;
}

export interface SubmitEvidenceInput {
  issueId: string;
  fieldWorkerId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  workSummary: string;
}

export interface NearbyReportCluster extends CivicIssue {
  distanceMeters: number;
  proximityType: "PROBABLE_DUPLICATE" | "NEARBY_CLUSTER";
}

export type VerificationDecision = "APPROVED" | "REWORK_REQUIRED";

export interface CivicIssueService {
  getIssues(): Promise<CivicIssue[]>;
  getIssue(id: string): Promise<CivicIssue | null>;
  createReport(input: CreateReportInput): Promise<CivicIssue>;
  assignIssue(
    issueId: string,
    departmentId: string,
    fieldWorkerId?: string,
    targetType?: AssignmentTargetType,
    teamId?: string
  ): Promise<CivicIssue>;
  getTeams?(): Promise<Team[]>;
  getFieldWorkers?(): Promise<UserProfile[]>;
  getFieldTasks?(): Promise<CivicIssue[]>;
  updateIssueStatus(issueId: string, status: IssueStatus, changedBy: string, comment?: string): Promise<CivicIssue>;
  routeDepartment?(issueId: string, departmentId: string, departmentNotes?: string): Promise<CivicIssue>;
  assignInternal?(issueId: string, targetType: "INDIVIDUAL" | "TEAM", teamId?: string, fieldWorkerId?: string, assignmentNotes?: string): Promise<CivicIssue>;
  moderateIssue?(issueId: string, newModerationStatus: ModerationStatus, moderatedBy: string, reason?: string): Promise<CivicIssue>;
  findNearbyDuplicates?(category: string, latitude: number, longitude: number, radiusMeters?: number): Promise<CivicIssue[]>;
  getNearbyIssues?(latitude: number, longitude: number, radiusMeters?: number, excludeIssueId?: string): Promise<NearbyReportCluster[]>;
  submitEvidence(input: SubmitEvidenceInput): Promise<ResolutionEvidence>;
  verifyResolution(issueId: string, decision?: VerificationDecision, notes?: string): Promise<VerificationResult | any>;
  approveVerification?(issueId: string, notes?: string): Promise<any>;
  rejectVerification?(issueId: string, reason: string): Promise<any>;
  getDashboardStats(): Promise<DashboardStats>;
  uploadImage?(file: File, folder: "reports" | "resolutions"): Promise<{ path: string; url: string }>;
}
