import type { RiskBucket } from '../../types';

const CLASS_LABELS = ['Bronchiectasis', 'Bronchiolitis', 'COPD', 'Healthy', 'Pneumonia', 'URTI'];

export interface InferenceResult {
  classProbabilities: Record<string, number>;
  confidence: number;
}

import { getApiUrl } from '../../config/api';

class ModelRunner {
  private getServerUrl(): string {
    return getApiUrl();
  }

  async loadModel(): Promise<void> {
    try {
      const res = await fetch(`${this.getServerUrl()}/health`);
      const data = await res.json();
      if (!data.model_loaded) {
        console.warn('Server running but no model loaded — will return mock predictions');
      }
    } catch {
      console.warn('Inference server not reachable, falling back to mock');
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

      const res = await fetch(`${this.getServerUrl()}/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        console.error('Inference server error:', res.status);
        return this.mockInference();
      }

      const data = await res.json();
      return {
        classProbabilities: data.classProbabilities,
        confidence: data.confidence,
      };
    } catch (error) {
      console.error('Inference request failed, using mock:', error);
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
