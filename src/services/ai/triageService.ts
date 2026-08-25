import { AITriageAssessment, AITriageInput, AITriageService } from "@/types/ai";

export const SYSTEM_PROMPT = `You are an expert multimodal civic infrastructure triage AI for a city management system.
Your task is to analyze citizen reports containing text and photo evidence, evaluate public hazards, and output a structured assessment.

Evaluation criteria:
1. isCivicIssue: boolean (true if genuine public/municipal civic issue; false if private dispute or non-civic content).
2. category: One of POTHOLE, GARBAGE, DRAINAGE, STREETLIGHT, WATER_LEAKAGE, OTHER.
3. severity: LOW, MEDIUM, HIGH, or CRITICAL based on physical damage and structural risk.
4. urgency: LOW, MEDIUM, HIGH, or CRITICAL based on time-sensitivity and danger.
5. impact: LOW, MEDIUM, HIGH, or CRITICAL based on public accessibility and community disruption.
6. priorityScore: Integer from 0 to 100 representing urgency & hazard severity.
7. priorityLevel: LOW (0-34), MEDIUM (35-59), HIGH (60-79), CRITICAL (80-100).
8. hazardClassification: Specific hazard title (e.g. "Road Traffic Hazard", "Public Health Risk", "Electrical Shock Hazard", "Water Wastage Hazard", "Drainage Overflow Hazard", "General Infrastructure Hazard").
9. confidenceScore: Number from 0.00 to 1.00 indicating visual and textual assessment confidence.
10. inJurisdiction: boolean (true if within municipal responsibility; false if private property or highway/state authority).
11. reasoning: Concise explanation (2-3 sentences) detailing visual evidence and hazard rationale.
12. recommendedDepartment: The exact municipal department responsible.
13. workSummary: Field worker response instructions.

Return ONLY a valid JSON object matching this exact structure:
{
  "isCivicIssue": true,
  "category": "POTHOLE",
  "severity": "HIGH",
  "urgency": "HIGH",
  "impact": "HIGH",
  "priorityScore": 85,
  "priorityLevel": "HIGH",
  "hazardClassification": "Road Traffic Hazard",
  "confidenceScore": 0.95,
  "inJurisdiction": true,
  "reasoning": "Narrative explanation...",
  "recommendedDepartment": "Roads & Infrastructure",
  "workSummary": "Field worker instructions..."
}`;

export function validateAssessment(data: any): data is AITriageAssessment {
  const validLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const validCategories = ["POTHOLE", "GARBAGE", "DRAINAGE", "STREETLIGHT", "WATER_LEAKAGE", "OTHER"];

  return (
    Boolean(data) &&
    typeof data.isCivicIssue === "boolean" &&
    validCategories.includes(data.category) &&
    validLevels.includes(data.severity) &&
    validLevels.includes(data.urgency) &&
    validLevels.includes(data.impact) &&
    typeof data.priorityScore === "number" &&
    Number.isInteger(data.priorityScore) &&
    data.priorityScore >= 0 &&
    data.priorityScore <= 100 &&
    validLevels.includes(data.priorityLevel) &&
    typeof data.hazardClassification === "string" &&
    data.hazardClassification.trim().length > 0 &&
    typeof data.confidenceScore === "number" &&
    data.confidenceScore >= 0.0 &&
    data.confidenceScore <= 1.0 &&
    typeof data.inJurisdiction === "boolean" &&
    typeof data.reasoning === "string" &&
    data.reasoning.trim().length > 0 &&
    typeof data.recommendedDepartment === "string" &&
    data.recommendedDepartment.trim().length > 0 &&
    typeof data.workSummary === "string" &&
    data.workSummary.trim().length > 0
  );
}

export class MultimodalGeminiTriageService implements AITriageService {
  async assess(input: AITriageInput): Promise<AITriageAssessment> {
    throw new Error("Direct assess call without validated signed URL is not allowed. Use assessMultimodal via authenticated API route.");
  }

  async assessMultimodal(input: AITriageInput, signedImageUrl: string): Promise<AITriageAssessment> {
    const serviceStartTime = Date.now();
    console.log(`[TriageService] [${new Date().toISOString()}] Starting assessMultimodal`);

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

    if (!apiKey) {
      throw new Error("OpenRouter API key (OPENROUTER_API_KEY) is not configured on server.");
    }

    if (!signedImageUrl || (!signedImageUrl.startsWith("http://") && !signedImageUrl.startsWith("https://"))) {
      throw new Error("Valid signed HTTPS image URL is required for multimodal AI triage evaluation.");
    }

    const userPromptText = `Title: ${input.title}\nDescription: ${input.description}\nCategory: ${input.category}\nAddress: ${input.addressText}\nWard: ${input.wardId}\nReport Count: ${input.reportCount || 1}`;

    const userContent = [
      { type: "text", text: userPromptText },
      { type: "image_url", image_url: { url: signedImageUrl } },
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 60-second timeout

    console.log(`[TriageService] Sending multimodal request to OpenRouter (model: ${model}, max_tokens: 1500, timeout: 60s)...`);
    const fetchStartTime = Date.now();

    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://civicfix.example.com",
          "X-Title": "CivicFix",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        console.error(`[TriageService] OpenRouter request timed out after 60 seconds.`);
        throw new Error("OpenRouter AI service timed out after 60 seconds. Please try submitting again.");
      }
      console.error(`[TriageService] OpenRouter network error:`, fetchErr.message);
      throw new Error(`OpenRouter network communication error: ${fetchErr.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    console.log(`[TriageService] OpenRouter responded in ${Date.now() - fetchStartTime}ms with status ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch {
        // use raw errorText
      }
      console.error(`[TriageService] OpenRouter error (${response.status}): ${errorDetail}`);
      throw new Error(`OpenRouter Multimodal API error (${response.status}): ${errorDetail}`);
    }

    const parseStartTime = Date.now();
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    console.log(`[TriageService] Response body parsed in ${Date.now() - parseStartTime}ms`);

    if (!content) {
      console.error("[TriageService] Empty message content from AI provider");
      throw new Error("Empty content received from Multimodal Gemini AI provider.");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr: any) {
      console.error("[TriageService] Failed to parse model output as JSON:", parseErr.message);
      throw new Error(`Failed to parse AI provider JSON output: ${parseErr.message}`);
    }

    const validateStartTime = Date.now();
    const isValid = validateAssessment(parsed);
    console.log(`[TriageService] Schema validation completed in ${Date.now() - validateStartTime}ms (valid: ${isValid})`);

    if (!isValid) {
      console.error("[TriageService] AI provider response failed validation:", parsed);
      throw new Error("AI provider response failed strict schema validation (missing or invalid fields).");
    }

    const timestamp = new Date().toISOString();
    console.log(`[TriageService] Assessment successfully prepared in total ${Date.now() - serviceStartTime}ms`);

    return {
      ...parsed,
      issueId: input.wardId + "-" + Date.now(),
      model: model,
      provider: "openrouter/gemini-multimodal",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}

export const triageService = new MultimodalGeminiTriageService();
