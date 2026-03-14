import type { CNNOutputTool, SignalSource, RiskBucket, Trend, SignalQuality } from '../../types';

interface SingleSignalResult {
  classProbabilities: Record<string, number>;
  confidence: number;
  signalQuality: SignalQuality;
}

export function fuseSignals(
  wearableResult: SingleSignalResult | null,
  coughResult: SingleSignalResult | null,
  sessionId: string,
  patientId: string,
  previousSessions: { pneumoniaRiskBucket: RiskBucket }[]
): CNNOutputTool {
  let source: SignalSource;
  let fused: SingleSignalResult;

  if (wearableResult && coughResult) {
    source = 'dual_fused';
    const fusedProbs: Record<string, number> = {};
    const allLabels = new Set([
      ...Object.keys(wearableResult.classProbabilities),
      ...Object.keys(coughResult.classProbabilities),
    ]);
    for (const label of allLabels) {
      const w = wearableResult.classProbabilities[label] ?? 0;
      const c = coughResult.classProbabilities[label] ?? 0;
      fusedProbs[label] = w * 0.7 + c * 0.3;
    }
    fused = {
      classProbabilities: fusedProbs,
      confidence: wearableResult.confidence * 0.7 + coughResult.confidence * 0.3,
      signalQuality: {
        qualityScore: Math.max(wearableResult.signalQuality.qualityScore, coughResult.signalQuality.qualityScore),
        noiseFloorDb: Math.min(wearableResult.signalQuality.noiseFloorDb, coughResult.signalQuality.noiseFloorDb),
        clippingRatio: Math.min(wearableResult.signalQuality.clippingRatio, coughResult.signalQuality.clippingRatio),
        durationSec: Math.max(wearableResult.signalQuality.durationSec, coughResult.signalQuality.durationSec),
      },
    };
  } else if (wearableResult) {
    source = 'wearable';
    fused = wearableResult;
  } else if (coughResult) {
    source = 'phone_mic';
    fused = coughResult;
  } else {
    throw new Error('At least one signal source is required');
  }

  const pneumoniaProb = fused.classProbabilities['Pneumonia'] ?? 0;
  const pneumoniaRiskBucket: RiskBucket =
    pneumoniaProb >= 0.6 ? 'high' : pneumoniaProb >= 0.3 ? 'medium' : 'low';

  const trend = computeTrend(pneumoniaRiskBucket, previousSessions);

  const requiresDoctorEscalation = pneumoniaRiskBucket === 'high';
  const requiresRepeatRecording = fused.signalQuality.qualityScore < 0.5;

  return {
    sessionId,
    patientId,
    capturedAt: new Date().toISOString(),
    modelId: 'lung_cnn_v1',
    modelVersion: '1.0.0',
    signalSource: source,
    classProbabilities: fused.classProbabilities,
    pneumoniaRiskBucket,
    confidence: fused.confidence,
    trend,
    signalQuality: fused.signalQuality,
    guardrails: {
      requiresRepeatRecording,
      requiresDoctorEscalation,
      escalationReason: requiresDoctorEscalation
        ? `Pneumonia probability ${(pneumoniaProb * 100).toFixed(0)}% exceeds threshold`
        : undefined,
    },
  };
}

function computeTrend(
  currentRisk: RiskBucket,
  previousSessions: { pneumoniaRiskBucket: RiskBucket }[]
): Trend {
  if (previousSessions.length === 0) return 'first_session';

  const riskOrder = { low: 0, medium: 1, high: 2 };
  const current = riskOrder[currentRisk];
  const previous = riskOrder[previousSessions[0].pneumoniaRiskBucket];

  if (current < previous) return 'improving';
  if (current > previous) return 'worsening';
  return 'stable';
}
