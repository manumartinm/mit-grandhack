import { apiFetch, parseApiError } from '../config/api';

export interface ServerPatient {
  id: number;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  age_years: number | null;
  village: string | null;
  asha_worker_id: string | null;
  weight_kg: number | null;
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePatientPayload {
  full_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  age_years?: number | null;
  village?: string | null;
  asha_worker_id?: string | null;
  weight_kg?: number | null;
  notes?: string | null;
}

export interface UpdatePatientPayload {
  full_name?: string;
  date_of_birth?: string;
  gender?: string;
  age_years?: number;
  village?: string;
  asha_worker_id?: string;
  weight_kg?: number;
  notes?: string;
}

export interface ServerMedicalRecord {
  id: number;
  patient_id: number;
  record_type: "lab_result" | "prescription" | "diagnosis" | "imaging" | "other";
  title: string;
  content: string;
  record_date: string | null;
  created_at: string;
}

export interface CreateMedicalRecordPayload {
  record_type: "lab_result" | "prescription" | "diagnosis" | "imaging" | "other";
  title: string;
  content: string;
  record_date?: string;
}

export interface ServerScreeningSession {
  id: string;
  patient_id: number;
  asha_worker_id: string | null;
  started_at: string;
  completed_at: string | null;
  signal_source: string | null;
  risk_bucket: string | null;
  confidence: number | null;
  requires_escalation: boolean;
  cnn_output: Record<string, any> | null;
  symptoms: string[] | null;
  zone_results: Record<string, any>[] | null;
  notes: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  referral_status: string | null;
  referral_timestamp: string | null;
  created_at: string;
}

export interface CreateSessionPayload {
  id: string;
  asha_worker_id?: string | null;
  started_at: string;
  completed_at?: string | null;
  signal_source?: string | null;
  risk_bucket?: string | null;
  confidence?: number | null;
  requires_escalation?: boolean;
  cnn_output?: Record<string, any> | null;
  symptoms?: string[];
  zone_results?: Record<string, any>[] | null;
  notes?: string | null;
  gps_lat?: number | null;
  gps_lon?: number | null;
  referral_status?: string | null;
  referral_timestamp?: string | null;
}

async function buildPatientApiError(
  response: Response,
  fallbackMessage: string
): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  const message = parseApiError(body, response.status);
  return new Error(message || fallbackMessage);
}

// ── Patients ──────────────────────────────────────────────────────────────────

export async function fetchPatients(token: string): Promise<ServerPatient[]> {
  const res = await apiFetch('/patients', {}, token);
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to fetch patients (${res.status})`);
  }
  return res.json();
}

export async function createPatient(
  payload: CreatePatientPayload,
  token: string
): Promise<ServerPatient> {
  const res = await apiFetch(
    '/patients',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to create patient (${res.status})`);
  }
  return res.json();
}

export async function updatePatient(
  id: number,
  payload: UpdatePatientPayload,
  token: string
): Promise<ServerPatient> {
  const res = await apiFetch(
    `/patients/${id}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    token
  );
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to update patient (${res.status})`);
  }
  return res.json();
}

export async function deletePatient(id: number, token: string): Promise<void> {
  const res = await apiFetch(`/patients/${id}`, { method: 'DELETE' }, token);
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to delete patient (${res.status})`);
  }
}

// ── Medical Records ───────────────────────────────────────────────────────────

export async function fetchMedicalRecords(
  patientId: number,
  token: string
): Promise<ServerMedicalRecord[]> {
  const res = await apiFetch(`/patients/${patientId}/emr`, {}, token);
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to fetch medical records (${res.status})`);
  }
  return res.json();
}

export async function createMedicalRecord(
  patientId: number,
  payload: CreateMedicalRecordPayload,
  token: string
): Promise<ServerMedicalRecord> {
  const res = await apiFetch(
    `/patients/${patientId}/emr`,
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to create medical record (${res.status})`);
  }
  return res.json();
}

export async function deleteMedicalRecord(
  patientId: number,
  recordId: number,
  token: string
): Promise<void> {
  const res = await apiFetch(
    `/patients/${patientId}/emr/${recordId}`,
    { method: 'DELETE' },
    token
  );
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to delete medical record (${res.status})`);
  }
}

// ── Screening Sessions ────────────────────────────────────────────────────────

export async function fetchSessions(
  patientId: number,
  token: string
): Promise<ServerScreeningSession[]> {
  const res = await apiFetch(`/patients/${patientId}/sessions`, {}, token);
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to fetch sessions (${res.status})`);
  }
  return res.json();
}

export async function createSession(
  patientId: number,
  payload: CreateSessionPayload,
  token: string
): Promise<ServerScreeningSession> {
  const res = await apiFetch(
    `/patients/${patientId}/sessions`,
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  if (!res.ok) {
    throw await buildPatientApiError(res, `Failed to sync session (${res.status})`);
  }
  return res.json();
}
