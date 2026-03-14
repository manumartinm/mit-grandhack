import type { RiskBucket } from "../../types";

export interface TriageInput {
  confidence: number;
  risk: RiskBucket;
  qualityScore: number;
  allZonesCaptured: boolean;
  severeSymptoms?: boolean;
}

export interface TriageDecision {
  requiresDoctorEscalation: boolean;
  requiresRepeatRecording: boolean;
  reason?: string;
}

export function deriveTriageDecision(input: TriageInput): TriageDecision {
  if (input.severeSymptoms) {
    return {
      requiresDoctorEscalation: true,
      requiresRepeatRecording: false,
      reason: "Severe symptoms reported. Immediate doctor consultation advised.",
    };
  }

  if (!input.allZonesCaptured) {
    return {
      requiresDoctorEscalation: true,
      requiresRepeatRecording: true,
      reason: "Incomplete lung zone recording. Please repeat and contact doctor.",
    };
  }

  if (input.confidence < 0.65) {
    return {
      requiresDoctorEscalation: true,
      requiresRepeatRecording: true,
      reason:
        "AI confidence is low for this recording. Contact doctor for a safer clinical decision.",
    };
  }

  if (input.qualityScore < 0.55) {
    return {
      requiresDoctorEscalation: true,
      requiresRepeatRecording: true,
      reason:
        "Recording quality is not sufficient for reliable analysis. Re-record and contact doctor.",
    };
  }

  if (input.risk === "high" || input.risk === "medium") {
    return {
      requiresDoctorEscalation: true,
      requiresRepeatRecording: false,
      reason: "Risk score indicates doctor follow-up is recommended.",
    };
  }

  return {
    requiresDoctorEscalation: false,
    requiresRepeatRecording: false,
  };
}
