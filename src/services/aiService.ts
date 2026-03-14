import type {
  CNNOutputTool,
  MedicalRecord,
  OutbreakAlert,
  Patient,
  RecentSoundRecord,
  ScreeningSession,
} from "../types";
import {
  getApiUrl,
  isLikelyOfflineError,
  parseApiError,
  retryFetch,
} from "../config/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatContext {
  patient: Patient | null;
  latestCnn: CNNOutputTool | null;
  recentRecords: RecentSoundRecord[];
  sessions: ScreeningSession[];
  outbreakAlerts: OutbreakAlert[];
  medicalRecords: MedicalRecord[];
}

function toServerMedicalRecord(record: MedicalRecord) {
  return {
    id: record.id,
    record_type: record.recordType,
    title: record.title,
    content: record.content,
    record_date: record.recordDate,
    created_at: record.createdAt,
  };
}

export async function streamChat(
  messages: ChatMessage[],
  context: ChatContext,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  token?: string | null,
): Promise<void> {
  if (!context.patient) {
    onError("Select a patient before starting AI chat.");
    return;
  }
  const patient = context.patient;

  const numericPatientId = parseInt(patient.id, 10);
  if (isNaN(numericPatientId)) {
    onError(
      "This patient hasn't synced to the server yet. Please connect to the internet and save the patient first.",
    );
    return;
  }

  try {
    const res = await retryFetch(
      () =>
        fetch(`${getApiUrl()}/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            patient_id: numericPatientId,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            cnn_output: context.latestCnn,
            outbreak_alerts: context.outbreakAlerts,
            medical_records: context.medicalRecords.map(toServerMedicalRecord),
          }),
          signal,
        }),
      2,
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      onError(parseApiError(body, res.status));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response stream");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.delta) onToken(parsed.delta);
          if (parsed.error) {
            onError(parsed.error);
            return;
          }
        } catch {
          // ignore malformed fragments
        }
      }
    }

    onDone();
  } catch (err: any) {
    if (err.name === "AbortError") return;
    onError(
      isLikelyOfflineError(err)
        ? "AI assistant requires internet connection."
        : err.message ?? "Request failed",
    );
  }
}
