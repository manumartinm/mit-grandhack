import { apiFetch } from '../config/api';

export interface ServerPatient {
  id: number;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePatientPayload {
  full_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  notes?: string | null;
}

export interface UpdatePatientPayload {
  full_name?: string;
  date_of_birth?: string;
  gender?: string;
  notes?: string;
}

export async function fetchPatients(token: string): Promise<ServerPatient[]> {
  const res = await apiFetch('/patients', {}, token);
  if (!res.ok) throw new Error(`Failed to fetch patients: ${res.status}`);
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
  if (!res.ok) throw new Error(`Failed to create patient: ${res.status}`);
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
  if (!res.ok) throw new Error(`Failed to update patient: ${res.status}`);
  return res.json();
}

export async function deletePatient(id: number, token: string): Promise<void> {
  const res = await apiFetch(`/patients/${id}`, { method: 'DELETE' }, token);
  if (!res.ok) throw new Error(`Failed to delete patient: ${res.status}`);
}
