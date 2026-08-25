import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized: Missing or malformed Bearer token." }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Empty session token." }, { status: 401 });
    }

    // Direct server-side token validation via supabaseAdmin
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired session token." },
        { status: 401 }
      );
    }

    // Verify MUNICIPAL_ADMIN role on server
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json(
        { error: "Forbidden: User profile not found." },
        { status: 403 }
      );
    }

    if (profile.role !== "MUNICIPAL_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only authorized Municipal Administrators can route issues across departments." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { issueId, departmentId, departmentNotes } = body as {
      issueId: string;
      departmentId: string;
      departmentNotes?: string;
    };

    if (!issueId || !departmentId) {
      return NextResponse.json({ error: "Missing required fields: issueId or departmentId." }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    // Fetch target issue
    const { data: currentIssue } = await supabaseAdmin
      .from("issues")
      .select("*")
      .eq("id", issueId)
      .maybeSingle();

    if (!currentIssue) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    const prevStatus = currentIssue.status || "SUBMITTED";

    // 1. Update issue department and status
    const issueUpdatePayload: any = {
      department_id: departmentId,
      status: "ROUTED_TO_DEPARTMENT",
      updated_at: timestamp,
    };

    const { error: issueErr } = await supabaseAdmin
      .from("issues")
      .update(issueUpdatePayload)
      .eq("id", issueId);

    if (issueErr) {
      console.error("Issue route update error:", issueErr);
      return NextResponse.json({ error: issueErr.message || "Failed to update issue routing." }, { status: 500 });
    }

    // 2. Log routing audit in status_history
    const departmentNameMap: Record<string, string> = {
      "dept-roads": "Roads & Infrastructure",
      "dept-sanitation": "Sanitation & Waste Management",
      "dept-electrical": "Electrical & Street Lighting",
      "dept-water": "Water Supply & Drainage",
      "dept-parks": "Parks & Public Spaces",
    };

    const deptName = departmentNameMap[departmentId] || departmentId;
    const auditComment = `ROUTED_TO_DEPARTMENT: Routed to [${deptName}]${departmentNotes?.trim() ? ` (Notes: ${departmentNotes.trim()})` : ""}`;

    await supabaseAdmin.from("status_history").insert({
      id: `sh-route-${Date.now()}`,
      issue_id: issueId,
      previous_status: prevStatus,
      new_status: "ROUTED_TO_DEPARTMENT",
      changed_by: user.id,
      comment: auditComment,
      timestamp,
    });

    return NextResponse.json({
      success: true,
      issueId,
      status: "ROUTED_TO_DEPARTMENT",
      departmentId,
      routedAt: timestamp,
    });
  } catch (err: any) {
    console.error("Department Routing Error:", err);
    return NextResponse.json({ error: err.message || "Failed to route issue to department." }, { status: 500 });
  }
}
