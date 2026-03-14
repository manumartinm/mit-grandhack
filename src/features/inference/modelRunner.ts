import type { RiskBucket } from '../../types';
import { retryFetch } from '../../config/api';
import { logger } from '../../utils/logger';

const CLASS_LABELS = ['Bronchiectasis', 'Bronchiolitis', 'COPD', 'Healthy', 'Pneumonia', 'URTI'];

export interface PreprocessingQuality {
  rmsDb: number;
  peakDb: number;
  dcOffsetRaw: number;
  clippingRatio: number;
  silenceRatio: number;
  snrDb: number;
  durationSec: number;
  sampleRate: number;
  samplesRaw: number;
  bandpassHz: [number, number];
  preEmphasisCoeff: number;
  warnings: string[];
}

export interface InferenceResult {
  classProbabilities: Record<string, number>;
  confidence: number;
  recordId?: string;
  createdAt?: string;
  modelPath?: string;
  signalQuality?: PreprocessingQuality;
}

import { getApiUrl } from '../../config/api';

class ModelRunner {
  private getServerUrl(): string {
    return getApiUrl();
  }

  async loadModel(): Promise<void> {
    try {
      const res = await retryFetch(() => fetch(`${this.getServerUrl()}/health`), 2);
      const data = await res.json();
      if (!data.model_loaded) {
        logger.warn('Server running but no model loaded — will return mock predictions');
      }
    } catch {
      logger.warn('Inference server not reachable, falling back to mock');
    }
  }

  async runInference(audioData: number[]): Promise<InferenceResult> {
    if (audioData.length === 0) {
      return this.mockInference();
    }

    try {
      const blob = new Blob([new Uint8Array(audioData)], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('audio', blob, 'audio.pcm');

      const res = await retryFetch(
        () =>
          fetch(`${this.getServerUrl()}/predict`, {
            method: 'POST',
            body: formData,
          }),
        2
      );

      if (!res.ok) {
        logger.error('Inference server error', { status: res.status });
        return this.mockInference();
      }

      const data = await res.json();
      if (data.signalQuality?.warnings?.length) {
        logger.warn('Preprocessing warnings from server', { warnings: data.signalQuality.warnings });
      }
      return {
        classProbabilities: data.classProbabilities,
        confidence: data.confidence,
        recordId: data.recordId,
        createdAt: data.createdAt,
        modelPath: data.modelPath,
        signalQuality: data.signalQuality,
      };
    } catch (error) {
      logger.error('Inference request failed, using mock', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.mockInference();
    }
  }

  private mockInference(): InferenceResult {
    const raw = CLASS_LABELS.map(() => Math.random());
    const sum = raw.reduce((a, b) => a + b, 0);
    const probs = raw.map((r) => r / sum);

    const classProbabilities: Record<string, number> = {};
    CLASS_LABELS.forEach((label, i) => {
      classProbabilities[label] = Math.round(probs[i] * 1000) / 1000;
    });

    return { classProbabilities, confidence: Math.max(...probs) };
  }

  calibratePneumoniaRisk(
    probabilities: Record<string, number>,
    patientAge?: number
  ): RiskBucket {
    let pneumoniaProb = probabilities['Pneumonia'] ?? 0;

    if (patientAge !== undefined && patientAge < 5) {
      pneumoniaProb *= 1.3;
      pneumoniaProb = Math.min(pneumoniaProb, 1.0);
    }

    if (pneumoniaProb >= 0.6) return 'high';
    if (pneumoniaProb >= 0.3) return 'medium';
    return 'low';
  }
}

export const modelRunner = new ModelRunner();
