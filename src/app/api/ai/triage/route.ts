import { NextRequest, NextResponse } from "next/server";
import { AITriageInput } from "@/types/ai";
import { triageService } from "@/services/ai/triageService";
import { supabase } from "@/services/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[API /api/ai/triage] [${new Date().toISOString()}] 1. Request received`);

  try {
    // 1. Authenticate caller from Authorization header token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.warn("[API /api/ai/triage] Missing Authorization header");
      return NextResponse.json({ error: "Unauthorized: Missing Authorization header." }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || !supabase) {
      console.warn("[API /api/ai/triage] Invalid token or Supabase not configured");
      return NextResponse.json({ error: "Unauthorized: Invalid session token or Supabase unconfigured." }, { status: 401 });
    }

    const authStart = Date.now();
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    console.log(`[API /api/ai/triage] 2. Authentication verified in ${Date.now() - authStart}ms`);

    if (authErr || !authData?.user) {
      console.warn("[API /api/ai/triage] Auth check failed:", authErr?.message);
      return NextResponse.json({ error: "Unauthorized: Invalid or expired session token." }, { status: 401 });
    }

    const userId = authData.user.id;

    // 2. Parse request body
    const input: AITriageInput = await req.json();

    if (!input.title || !input.description || !input.category || !input.imageUrl) {
      console.warn("[API /api/ai/triage] Validation error: missing fields");
      return NextResponse.json({ error: "Validation error: Missing required report triage fields." }, { status: 400 });
    }

    // 3. Validate image storage path ownership (must match reports/{authenticated-user-id}/...)
    const expectedPrefix = `reports/${userId}/`;
    if (!input.imageUrl.startsWith(expectedPrefix)) {
      console.warn(`[API /api/ai/triage] Path ownership mismatch: ${input.imageUrl} does not match ${expectedPrefix}`);
      return NextResponse.json(
        { error: `Access denied: Storage path '${input.imageUrl}' does not belong to authenticated user '${userId}'.` },
        { status: 403 }
      );
    }

    // 4. Create short-lived 60-second signed URL using privileged server-side admin client
    const signStart = Date.now();
    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from("civicfix-evidence")
      .createSignedUrl(input.imageUrl, 60);

    console.log(`[API /api/ai/triage] 3. Signed URL generated in ${Date.now() - signStart}ms`);

    if (signedErr || !signedData?.signedUrl) {
      console.error("[API /api/ai/triage] Signed URL creation error:", signedErr);
      return NextResponse.json({ error: "Failed to generate signed URL for evidence image." }, { status: 500 });
    }

    // 5. Execute server-side Multimodal Gemini AI Triage
    console.log("[API /api/ai/triage] 4. Starting triageService.assessMultimodal()");
    const assessment = await triageService.assessMultimodal(input, signedData.signedUrl);
    console.log(`[API /api/ai/triage] 5. Triage completed successfully in total ${Date.now() - startTime}ms`);

    // 6. Return validated AI triage assessment
    return NextResponse.json(assessment);
  } catch (error: any) {
    console.error(`[API /api/ai/triage] Multimodal Triage error after ${Date.now() - startTime}ms:`, error.message);
    return NextResponse.json(
      { error: error.message || "Failed to process multimodal AI triage assessment." },
      { status: 500 }
    );
  }
}
