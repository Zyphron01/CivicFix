import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DashboardStats } from "@/types/civic";

export async function GET() {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("issues")
      .select("status, priority_level");

    if (error || !rows) {
      return NextResponse.json<DashboardStats>({
        totalIssues: 0,
        resolvedIssues: 0,
        pendingVerification: 0,
        criticalIssues: 0,
        averageResolutionDays: 2.4,
      });
    }

    const totalIssues = rows.length;
    const resolvedIssues = rows.filter((i) => i.status === "RESOLVED").length;
    const pendingVerification = rows.filter((i) => i.status === "VERIFICATION").length;
    const criticalIssues = rows.filter((i) => i.priority_level === "CRITICAL").length;

    return NextResponse.json<DashboardStats>({
      totalIssues,
      resolvedIssues,
      pendingVerification,
      criticalIssues,
      averageResolutionDays: 2.4,
    });
  } catch (e) {
    console.error("API stats endpoint error:", e);
    return NextResponse.json<DashboardStats>({
      totalIssues: 0,
      resolvedIssues: 0,
      pendingVerification: 0,
      criticalIssues: 0,
      averageResolutionDays: 2.4,
    });
  }
}
