import {
  CivicIssue,
  CivicIssueService,
  CreateReportInput,
  DashboardStats,
  ResolutionEvidence,
  SubmitEvidenceInput,
  VerificationResult,
  IssueStatus,
  UserProfile,
  Team,
  AssignmentTargetType,
  ModerationStatus,
} from "@/types/civic";
import { calculateSLAHours } from "./supabaseCivicService";

const LOCAL_STORAGE_KEY = "civicfix.mock.issues.v1";

const MOCK_ISSUES: CivicIssue[] = [
  {
    id: "issue-1",
    canonicalTitle: "Severe Pothole on MG Road near Junction 4",
    category: "POTHOLE",
    status: "ASSIGNED",
    priorityLevel: "HIGH",
    priorityScore: 85,
    wardId: "ward-10",
    departmentId: "dept-roads",
    latitude: 12.9716,
    longitude: 77.5946,
    addressText: "MG Road, Junction 4, Central Ward",
    reportCount: 3,
    reports: [
      {
        id: "rep-1",
        issueId: "issue-1",
        citizenId: "cit-1",
        description: "Deep pothole causing bike skidding.",
        imageUrl: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f8?auto=format&fit=crop&w=600&q=80",
        latitude: 12.9716,
        longitude: 77.5946,
        wardId: "ward-10",
        createdAt: "2026-08-10T10:00:00Z",
      },
      {
        id: "rep-2",
        issueId: "issue-1",
        citizenId: "cit-2",
        description: "Nearly caused an accident this morning.",
        latitude: 12.9717,
        longitude: 77.5947,
        wardId: "ward-10",
        createdAt: "2026-08-10T11:30:00Z",
      },
    ],
    assignment: {
      id: "asg-1",
      issueId: "issue-1",
      departmentId: "dept-roads",
      fieldWorkerId: "field-1",
      assignedAt: "2026-08-10T14:00:00Z",
      targetResolutionDate: "2026-08-15T18:00:00Z",
      notes: "Priority dispatch for arterial road.",
    },
    statusHistory: [
      {
        id: "sh-1",
        issueId: "issue-1",
        newStatus: "SUBMITTED",
        changedBy: "cit-1",
        timestamp: "2026-08-10T10:00:00Z",
      },
      {
        id: "sh-2",
        issueId: "issue-1",
        previousStatus: "SUBMITTED",
        newStatus: "ASSIGNED",
        changedBy: "admin-1",
        comment: "Assigned to Roads & Infrastructure Department",
        timestamp: "2026-08-10T14:00:00Z",
      },
    ],
    createdAt: "2026-08-10T10:00:00Z",
    updatedAt: "2026-08-10T14:00:00Z",
  },
  {
    id: "issue-2",
    canonicalTitle: "Garbage Dump Accumulation near Market Gate",
    category: "GARBAGE",
    status: "SUBMITTED",
    priorityLevel: "MEDIUM",
    priorityScore: 60,
    wardId: "ward-12",
    latitude: 12.9352,
    longitude: 77.6245,
    addressText: "Market Gate, South Ward",
    reportCount: 1,
    reports: [
      {
        id: "rep-3",
        issueId: "issue-2",
        citizenId: "cit-3",
        description: "Uncollected garbage piled up for 3 days.",
        latitude: 12.9352,
        longitude: 77.6245,
        wardId: "ward-12",
        createdAt: "2026-08-12T08:15:00Z",
      },
    ],
    statusHistory: [
      {
        id: "sh-3",
        issueId: "issue-2",
        newStatus: "SUBMITTED",
        changedBy: "cit-3",
        timestamp: "2026-08-12T08:15:00Z",
      },
    ],
    createdAt: "2026-08-12T08:15:00Z",
    updatedAt: "2026-08-12T08:15:00Z",
  },
  {
    id: "issue-3",
    canonicalTitle: "Blocked Drainage Causing Waterlogging",
    category: "DRAINAGE",
    status: "IN_PROGRESS",
    priorityLevel: "CRITICAL",
    priorityScore: 92,
    wardId: "ward-05",
    departmentId: "dept-sanitation",
    latitude: 12.9901,
    longitude: 77.5512,
    addressText: "1st Main Road, North Ward",
    reportCount: 4,
    reports: [
      {
        id: "rep-4",
        issueId: "issue-3",
        citizenId: "cit-4",
        description: "Drainage overflowing into residential street.",
        latitude: 12.9901,
        longitude: 77.5512,
        wardId: "ward-05",
        createdAt: "2026-08-08T09:00:00Z",
      },
    ],
    assignment: {
      id: "asg-2",
      issueId: "issue-3",
      departmentId: "dept-sanitation",
      fieldWorkerId: "field-2",
      assignedAt: "2026-08-08T11:00:00Z",
      targetResolutionDate: "2026-08-11T18:00:00Z",
    },
    statusHistory: [
      {
        id: "sh-4",
        issueId: "issue-3",
        newStatus: "SUBMITTED",
        changedBy: "cit-4",
        timestamp: "2026-08-08T09:00:00Z",
      },
      {
        id: "sh-5",
        issueId: "issue-3",
        previousStatus: "SUBMITTED",
        newStatus: "IN_PROGRESS",
        changedBy: "field-2",
        comment: "Jetty vehicle deployed to site.",
        timestamp: "2026-08-08T12:00:00Z",
      },
    ],
    createdAt: "2026-08-08T09:00:00Z",
    updatedAt: "2026-08-08T12:00:00Z",
  },
  {
    id: "issue-4",
    canonicalTitle: "Non-functional Streetlight on Park Avenue",
    category: "STREETLIGHT",
    status: "VERIFICATION",
    priorityLevel: "LOW",
    priorityScore: 30,
    wardId: "ward-08",
    departmentId: "dept-electrical",
    latitude: 12.9654,
    longitude: 77.5812,
    addressText: "Park Avenue, East Ward",
    reportCount: 1,
    reports: [
      {
        id: "rep-5",
        issueId: "issue-4",
        citizenId: "cit-5",
        description: "Streetlight flickering and completely dark at night.",
        latitude: 12.9654,
        longitude: 77.5812,
        wardId: "ward-08",
        createdAt: "2026-08-05T19:00:00Z",
      },
    ],
    assignment: {
      id: "asg-3",
      issueId: "issue-4",
      departmentId: "dept-electrical",
      fieldWorkerId: "field-3",
      assignedAt: "2026-08-06T10:00:00Z",
      targetResolutionDate: "2026-08-09T18:00:00Z",
    },
    resolutionEvidence: {
      id: "ev-1",
      issueId: "issue-4",
      fieldWorkerId: "field-3",
      beforeImageUrl: "https://images.unsplash.com/photo-1541888946425-d0fbb18f86f6?auto=format&fit=crop&w=600&q=80",
      afterImageUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=600&q=80",
      workSummary: "Replaced faulty LED ballast and bulb fixture.",
      submittedAt: "2026-08-09T16:00:00Z",
    },
    verificationResult: {
      id: "ver-1",
      issueId: "issue-4",
      aiConfidenceScore: 0.94,
      aiMatchDetected: true,
      aiExplanation: "AI visual verification confirms new working LED fixture installed at target coordinate.",
      verifiedAt: "2026-08-09T16:05:00Z",
    },
    statusHistory: [
      {
        id: "sh-6",
        issueId: "issue-4",
        newStatus: "SUBMITTED",
        changedBy: "cit-5",
        timestamp: "2026-08-05T19:00:00Z",
      },
      {
        id: "sh-7",
        issueId: "issue-4",
        previousStatus: "SUBMITTED",
        newStatus: "VERIFICATION",
        changedBy: "field-3",
        comment: "Evidence submitted for AI & Citizen verification.",
        timestamp: "2026-08-09T16:00:00Z",
      },
    ],
    createdAt: "2026-08-05T19:00:00Z",
    updatedAt: "2026-08-09T16:05:00Z",
  },
  {
    id: "issue-5",
    canonicalTitle: "Drinking Water Pipe Leakage on Church Street",
    category: "WATER_LEAKAGE",
    status: "RESOLVED",
    priorityLevel: "HIGH",
    priorityScore: 88,
    wardId: "ward-02",
    departmentId: "dept-water",
    latitude: 12.9750,
    longitude: 77.6050,
    addressText: "Church Street, Central Ward",
    reportCount: 2,
    reports: [
      {
        id: "rep-6",
        issueId: "issue-5",
        citizenId: "cit-6",
        description: "Continuous clean water wastage from underground joint.",
        latitude: 12.9750,
        longitude: 77.6050,
        wardId: "ward-02",
        createdAt: "2026-08-01T07:00:00Z",
      },
    ],
    assignment: {
      id: "asg-4",
      issueId: "issue-5",
      departmentId: "dept-water",
      fieldWorkerId: "field-4",
      assignedAt: "2026-08-01T09:00:00Z",
      targetResolutionDate: "2026-08-02T18:00:00Z",
    },
    resolutionEvidence: {
      id: "ev-2",
      issueId: "issue-5",
      fieldWorkerId: "field-4",
      beforeImageUrl: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
      afterImageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80",
      workSummary: "Excavated joint, replaced gasket and sealed pipe flange.",
      submittedAt: "2026-08-02T15:00:00Z",
    },
    verificationResult: {
      id: "ver-2",
      issueId: "issue-5",
      aiConfidenceScore: 0.98,
      aiMatchDetected: true,
      aiExplanation: "Dry surface and sealed pipe joint verified.",
      verifiedAt: "2026-08-02T15:10:00Z",
    },
    statusHistory: [
      {
        id: "sh-8",
        issueId: "issue-5",
        newStatus: "SUBMITTED",
        changedBy: "cit-6",
        timestamp: "2026-08-01T07:00:00Z",
      },
      {
        id: "sh-9",
        issueId: "issue-5",
        previousStatus: "VERIFICATION",
        newStatus: "RESOLVED",
        changedBy: "cit-6",
        comment: "Citizen accepted resolution.",
        timestamp: "2026-08-02T17:00:00Z",
      },
    ],
    createdAt: "2026-08-01T07:00:00Z",
    updatedAt: "2026-08-02T17:00:00Z",
  },
];

export class MockCivicService implements CivicIssueService {
  private loadIssues(): CivicIssue[] {
    if (typeof window === "undefined") {
      return [...MOCK_ISSUES];
    }
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to load issues from localStorage", e);
    }
    return [...MOCK_ISSUES];
  }

  private saveIssues(issues: CivicIssue[]): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(issues));
    } catch (e) {
      console.warn("Failed to save issues to localStorage", e);
    }
  }

  async getIssues(): Promise<CivicIssue[]> {
    return this.loadIssues();
  }

  async getFieldTasks(): Promise<CivicIssue[]> {
    return this.loadIssues();
  }

  async getIssue(id: string): Promise<CivicIssue | null> {
    const issues = this.loadIssues();
    const found = issues.find((i) => i.id === id);
    return found ? { ...found } : null;
  }

  async createReport(input: CreateReportInput): Promise<CivicIssue> {
    const issues = this.loadIssues();
    const newId = `issue-${Date.now()}`;
    const newReportId = `rep-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const newReport = {
      id: newReportId,
      issueId: newId,
      citizenId: input.citizenId,
      description: input.description,
      imageUrl: input.imageUrl,
      latitude: input.latitude,
      longitude: input.longitude,
      wardId: input.wardId,
      createdAt: timestamp,
    };

    const newIssue: CivicIssue = {
      id: newId,
      canonicalTitle: input.title,
      category: input.category,
      status: "SUBMITTED",
      priorityLevel: "MEDIUM",
      priorityScore: 50,
      wardId: input.wardId,
      latitude: input.latitude,
      longitude: input.longitude,
      addressText: input.addressText,
      locationSource: input.locationSource || "MANUAL_MAP_SELECTION",
      locationAccuracy: input.locationAccuracy,
      moderationStatus: "ACTIVE",
      reportCount: 1,
      reports: [newReport],
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          issueId: newId,
          newStatus: "SUBMITTED",
          changedBy: input.citizenId,
          timestamp,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    issues.unshift(newIssue);
    this.saveIssues(issues);
    return newIssue;
  }

  async getFieldWorkers(): Promise<UserProfile[]> {
    return [
      { id: "c5f6fd21-6b34-4606-a767-bdae3026c3ab", fullName: "Field Worker Response Crew (worker.test@civicfix.local)", role: "FIELD_WORKER" },
      { id: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe", fullName: "Sanitation Emergency Field Crew (worker.demo2@civicfix.local)", role: "FIELD_WORKER" }
    ];
  }

  async getTeams(): Promise<Team[]> {
    return [
      { id: "team-roads", name: "Roads & Asphalt Response Crew", description: "Rapid asphalt patching and road hazard resolution team", specialization: "POTHOLE", isActive: true, leadWorkerId: "c5f6fd21-6b34-4606-a767-bdae3026c3ab" },
      { id: "team-sanitation", name: "Sanitation & Drainage Emergency Unit", description: "High-pressure drain clearance and waste disposal crew", specialization: "GARBAGE", isActive: true, leadWorkerId: "c9f8e7d6-5c4b-3a21-0fed-9876543210fe" }
    ];
  }

  async assignIssue(
    issueId: string,
    departmentId: string,
    fieldWorkerId?: string,
    targetType: AssignmentTargetType = "INDIVIDUAL",
    teamId?: string
  ): Promise<CivicIssue> {
    if (targetType === "INDIVIDUAL") {
      if (!fieldWorkerId || teamId) {
        throw new Error("Invalid assignment target combination: INDIVIDUAL target requires fieldWorkerId and must have null teamId.");
      }
    } else if (targetType === "TEAM") {
      if (!teamId || fieldWorkerId) {
        throw new Error("Invalid assignment target combination: TEAM target requires teamId and must have null fieldWorkerId.");
      }
    }

    const issues = this.loadIssues();
    const issueIndex = issues.findIndex((i) => i.id === issueId);
    if (issueIndex === -1) throw new Error("Issue not found");

    const issue = { ...issues[issueIndex] };
    const timestamp = new Date().toISOString();
    issue.departmentId = departmentId;
    issue.status = "ASSIGNED";
    const prevTarget = issue.assignment
      ? (issue.assignment.targetType === "TEAM" ? `Team:${issue.assignment.teamId}` : `Worker:${issue.assignment.fieldWorkerId}`)
      : "Unassigned";

    const newTarget = targetType === "TEAM" ? `Team:${teamId}` : `Worker:${fieldWorkerId}`;
    const isReassignment = issue.assignment !== undefined;

    if (issue.assignment) {
      issue.assignment.isActive = false;
    }

    const slaHours = calculateSLAHours(issue.priorityLevel, issue.priorityScore);
    issue.assignment = {
      id: `asg-${Date.now()}`,
      issueId,
      departmentId,
      targetType,
      fieldWorkerId: targetType === "INDIVIDUAL" ? fieldWorkerId : undefined,
      teamId: targetType === "TEAM" ? teamId : undefined,
      assignedAt: timestamp,
      targetResolutionDate: new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString(),
      isActive: true,
    };

    const auditComment = isReassignment
      ? `REASSIGNMENT: Reassigned from [${prevTarget}] to [${newTarget}] (TargetType: ${targetType})`
      : `Assigned via ${targetType} targeting to ${targetType === "TEAM" ? teamId : fieldWorkerId}`;

    issue.statusHistory.push({
      id: `sh-${Date.now()}`,
      issueId,
      previousStatus: issue.status,
      newStatus: "ASSIGNED",
      changedBy: "admin-system",
      comment: auditComment,
      timestamp,
    });
    issue.updatedAt = timestamp;

    issues[issueIndex] = issue;
    this.saveIssues(issues);
    return issue;
  }

  async updateIssueStatus(
    issueId: string,
    status: IssueStatus,
    changedBy: string,
    comment?: string
  ): Promise<CivicIssue> {
    const issues = this.loadIssues();
    const issueIndex = issues.findIndex((i) => i.id === issueId);
    if (issueIndex === -1) throw new Error("Issue not found");

    const issue = { ...issues[issueIndex] };
    const timestamp = new Date().toISOString();
    const previousStatus = issue.status;
    issue.status = status;
    issue.statusHistory.push({
      id: `sh-${Date.now()}`,
      issueId,
      previousStatus,
      newStatus: status,
      changedBy,
      comment,
      timestamp,
    });
    issue.updatedAt = timestamp;

    issues[issueIndex] = issue;
    this.saveIssues(issues);
    return issue;
  }

  async moderateIssue(
    issueId: string,
    newModerationStatus: ModerationStatus,
    moderatedBy: string,
    reason?: string
  ): Promise<CivicIssue> {
    const issues = this.loadIssues();
    const issueIndex = issues.findIndex((i) => i.id === issueId);
    if (issueIndex === -1) throw new Error("Issue not found");

    const issue = { ...issues[issueIndex] };
    const timestamp = new Date().toISOString();
    const previousStatus = issue.moderationStatus || "ACTIVE";
    issue.moderationStatus = newModerationStatus;
    issue.moderationReason = reason;
    issue.moderatedAt = timestamp;
    issue.moderatedBy = moderatedBy;
    issue.updatedAt = timestamp;

    issue.statusHistory.push({
      id: `sh-mod-${Date.now()}`,
      issueId,
      previousStatus: issue.status,
      newStatus: issue.status,
      changedBy: moderatedBy,
      comment: `MODERATION CHANGE: [${previousStatus}] -> [${newModerationStatus}]${reason ? ` (Reason: ${reason})` : ""}`,
      timestamp,
    });

    if (newModerationStatus === "REJECTED" || newModerationStatus === "ARCHIVED") {
      if (issue.assignment) {
        issue.assignment.isActive = false;
        issue.assignment.notes = `IS_ACTIVE:FALSE|MODERATION:${newModerationStatus}`;
      }
    }

    issues[issueIndex] = issue;
    this.saveIssues(issues);
    return issue;
  }

  async findNearbyDuplicates(
    category: string,
    latitude: number,
    longitude: number,
    radiusMeters: number = 200
  ): Promise<CivicIssue[]> {
    const issues = this.loadIssues();
    return issues.filter((i) => {
      if (i.status === "RESOLVED") return false;
      if (i.moderationStatus === "REJECTED" || i.moderationStatus === "ARCHIVED") return false;

      const latDiff = Math.abs(i.latitude - latitude);
      const lngDiff = Math.abs(i.longitude - longitude);
      const approxDistMeters = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000;

      return approxDistMeters <= radiusMeters;
    });
  }

  async submitEvidence(input: SubmitEvidenceInput): Promise<ResolutionEvidence> {
    const issues = this.loadIssues();
    const issueIndex = issues.findIndex((i) => i.id === input.issueId);
    if (issueIndex === -1) throw new Error("Issue not found");

    const issue = { ...issues[issueIndex] };
    const timestamp = new Date().toISOString();
    const evidence: ResolutionEvidence = {
      id: `ev-${Date.now()}`,
      issueId: input.issueId,
      fieldWorkerId: input.fieldWorkerId,
      beforeImageUrl: input.beforeImageUrl,
      afterImageUrl: input.afterImageUrl,
      workSummary: input.workSummary,
      submittedAt: timestamp,
    };

    issue.resolutionEvidence = evidence;
    issue.status = "VERIFICATION";
    issue.statusHistory.push({
      id: `sh-${Date.now()}`,
      issueId: input.issueId,
      previousStatus: issue.status,
      newStatus: "VERIFICATION",
      changedBy: input.fieldWorkerId,
      comment: "Resolution evidence submitted for verification.",
      timestamp,
    });
    issue.updatedAt = timestamp;

    issues[issueIndex] = issue;
    this.saveIssues(issues);
    return evidence;
  }

  async verifyResolution(issueId: string): Promise<VerificationResult> {
    const issues = this.loadIssues();
    const issueIndex = issues.findIndex((i) => i.id === issueId);
    if (issueIndex === -1) throw new Error("Issue not found");

    const issue = { ...issues[issueIndex] };
    const timestamp = new Date().toISOString();
    const result: VerificationResult = {
      id: `ver-${Date.now()}`,
      issueId,
      aiConfidenceScore: 0.95,
      aiMatchDetected: true,
      aiExplanation: "AI automated validation confirms successful before/after state comparison.",
      verifiedAt: timestamp,
    };

    issue.verificationResult = result;
    issue.status = "RESOLVED";
    issue.statusHistory.push({
      id: `sh-${Date.now()}`,
      issueId,
      previousStatus: "VERIFICATION",
      newStatus: "RESOLVED",
      changedBy: "ai-system",
      comment: "Verified and closed via AI visual verification.",
      timestamp,
    });
    issue.updatedAt = timestamp;

    issues[issueIndex] = issue;
    this.saveIssues(issues);
    return result;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const issues = this.loadIssues();
    const totalIssues = issues.length;
    const resolvedIssues = issues.filter((i) => i.status === "RESOLVED").length;
    const pendingVerification = issues.filter((i) => i.status === "VERIFICATION").length;
    const criticalIssues = issues.filter((i) => i.priorityLevel === "CRITICAL").length;

    return {
      totalIssues,
      resolvedIssues,
      pendingVerification,
      criticalIssues,
      averageResolutionDays: 2.4,
    };
  }

  async getNearbyIssues(
    latitude: number,
    longitude: number,
    radiusMeters: number = 250,
    excludeIssueId?: string
  ): Promise<any[]> {
    const issues = this.loadIssues();
    const results: any[] = [];

    for (const issue of issues) {
      if (excludeIssueId && issue.id === excludeIssueId) continue;
      if (issue.moderationStatus === "REJECTED" || issue.moderationStatus === "ARCHIVED") continue;

      const latDiff = Math.abs(issue.latitude - latitude);
      const lngDiff = Math.abs(issue.longitude - longitude);
      const approxDistMeters = Math.round(Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000);

      if (approxDistMeters <= radiusMeters) {
        results.push({
          ...issue,
          distanceMeters: approxDistMeters,
          proximityType: approxDistMeters <= 50 ? "PROBABLE_DUPLICATE" : "NEARBY_CLUSTER",
        });
      }
    }

    return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  async uploadImage(
    file: File,
    folder: "reports" | "resolutions"
  ): Promise<{ path: string; url: string }> {
    const fakeUrl = URL.createObjectURL(file);
    return { path: `mock/${folder}/${file.name}`, url: fakeUrl };
  }
}

export const civicService = new MockCivicService();
