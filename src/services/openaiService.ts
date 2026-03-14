import { getApiUrl, parseApiError, retryFetch } from "../config/api";
import type { CNNOutputTool, Patient, ScreeningSession } from "../types";

export interface ScreeningTriageInsight {
  verdict: string;
  explanation: string;
  warningSigns: string[];
  nextActions: string[];
  recommendReferral: boolean;
}

const TRIAGE_FALLBACK: ScreeningTriageInsight = {
  verdict: "Screening review unavailable",
  explanation:
    "AI triage could not be generated at this time. Use clinical judgement and escalate if red-flag symptoms are present.",
  warningSigns: [
    "Fast breathing or chest indrawing",
    "Persistent fever or worsening cough",
    "Lethargy or poor oral intake",
  ],
  nextActions: [
    "Repeat screening if quality is poor",
    "Document symptoms and vitals",
    "Escalate to doctor if symptoms worsen",
  ],
  recommendReferral: false,
};

function compactSessionSummary(previousSessions: ScreeningSession[]) {
  return previousSessions.slice(0, 5).map((session) => ({
    startedAt: session.startedAt,
    trend: session.cnnOutput?.trend,
    risk: session.cnnOutput?.pneumoniaRiskBucket,
    confidence: session.cnnOutput?.confidence,
    pneumoniaProbability: session.cnnOutput?.classProbabilities?.Pneumonia,
  }));
}

export async function generateScreeningInsights(
  token: string,
  cnn: CNNOutputTool,
  patient: Patient | null,
  previousSessions: ScreeningSession[],
): Promise<ScreeningTriageInsight> {
  const res = await retryFetch(
    () =>
      fetch(`${getApiUrl()}/ai/screening-insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patient_id: patient ? Number(patient.id) || null : null,
          cnn_output: cnn,
          previous_sessions: compactSessionSummary(previousSessions),
        }),
      }),
    2,
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, res.status));
  }

  const data = await res.json();
  const raw = String(data.insights ?? "").trim();

  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned) as Partial<ScreeningTriageInsight>;
    return {
      verdict: parsed.verdict?.trim() || TRIAGE_FALLBACK.verdict,
      explanation: parsed.explanation?.trim() || TRIAGE_FALLBACK.explanation,
      warningSigns:
        parsed.warningSigns?.filter(Boolean).map((x) => String(x)) ??
        TRIAGE_FALLBACK.warningSigns,
      nextActions:
        parsed.nextActions?.filter(Boolean).map((x) => String(x)) ??
        TRIAGE_FALLBACK.nextActions,
      recommendReferral:
        typeof parsed.recommendReferral === "boolean"
          ? parsed.recommendReferral
          : TRIAGE_FALLBACK.recommendReferral,
    };
  } catch {
    return TRIAGE_FALLBACK;
  }
}

export async function extractTextFromImage(
  token: string,
  base64Image: string,
  mimeType: string = "image/jpeg",
): Promise<string> {
  const res = await retryFetch(
    () =>
      fetch(`${getApiUrl()}/ai/ocr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          image_base64: base64Image,
          mime_type: mimeType,
        }),
      }),
    2,
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiError(body, res.status));
  }

  const data = await res.json();
  const extracted = String(data.text ?? "").trim();
  // Treat model "unable to extract" responses as empty
  const noTextPatterns = /^(no text|no readable text|unable to extract|could not extract|no content|n\/a)[\s.]*$/i;
  if (!extracted || noTextPatterns.test(extracted)) {
    return "";
  }
  return extracted;
}

