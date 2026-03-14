import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Patient, ScreeningSession, RecentSoundRecord } from '../types';
import {
  fetchPatients as apiFetchPatients,
  createPatient as apiCreatePatient,
  deletePatient as apiDeletePatient,
  type ServerPatient,
} from '../services/patientApi';

function serverToLocal(sp: ServerPatient): Patient {
  let extra: Record<string, any> = {};
  try {
    if (sp.notes) extra = JSON.parse(sp.notes);
  } catch {}

  return {
    id: String(sp.id),
    name: sp.full_name,
    age: extra.age ?? 0,
    sex: (sp.gender as Patient['sex']) ?? 'other',
    weight: extra.weight,
    village: extra.village ?? '',
    ashaWorkerId: extra.ashaWorkerId ?? String(sp.created_by),
    comorbidities: extra.comorbidities ?? [],
    vaccinations: extra.vaccinations ?? [],
    medications: extra.medications ?? [],
    allergies: extra.allergies ?? [],
    priorDiagnoses: extra.priorDiagnoses ?? [],
    createdAt: sp.created_at,
    updatedAt: sp.updated_at,
  };
}

function localToServerPayload(p: Patient) {
  const extra = {
    age: p.age,
    weight: p.weight,
    village: p.village,
    ashaWorkerId: p.ashaWorkerId,
    comorbidities: p.comorbidities,
    vaccinations: p.vaccinations,
    medications: p.medications,
    allergies: p.allergies,
    priorDiagnoses: p.priorDiagnoses,
  };
  return {
    full_name: p.name,
    date_of_birth: null as string | null,
    gender: p.sex,
    notes: JSON.stringify(extra),
  };
}

interface PatientStore {
  patients: Patient[];
  sessions: ScreeningSession[];
  selectedPatientId: string | null;
  isSyncing: boolean;

  addPatient: (patient: Patient) => void;
  updatePatient: (id: string, updates: Partial<Patient>) => void;
  removePatient: (id: string) => void;
  selectPatient: (id: string | null) => void;
  getPatient: (id: string) => Patient | undefined;

  addSession: (session: ScreeningSession) => void;
  updateSession: (id: string, updates: Partial<ScreeningSession>) => void;
  getSessionsForPatient: (patientId: string) => ScreeningSession[];
  getRecentSoundRecords: (patientId: string, limit?: number) => RecentSoundRecord[];

  getHighRiskPatients: () => Patient[];
  getTodaySessionCount: () => number;

  syncFromServer: (token: string) => Promise<void>;
  addPatientWithSync: (patient: Patient, token: string) => Promise<void>;
  removePatientWithSync: (id: string, token: string) => Promise<void>;
}

export const usePatientStore = create<PatientStore>()(
  persist(
    (set, get) => ({
      patients: [],
      sessions: [],
      selectedPatientId: null,
      isSyncing: false,

      addPatient: (patient) => set((s) => ({ patients: [...s.patients, patient] })),

      updatePatient: (id, updates) =>
        set((s) => ({
          patients: s.patients.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        })),

      removePatient: (id) => set((s) => ({ patients: s.patients.filter((p) => p.id !== id) })),

      selectPatient: (id) => set({ selectedPatientId: id }),

      getPatient: (id) => get().patients.find((p) => p.id === id),

      addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),

      updateSession: (id, updates) =>
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === id ? { ...ses, ...updates } : ses)),
        })),

      getSessionsForPatient: (patientId) =>
        get()
          .sessions.filter((s) => s.patientId === patientId)
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),

      getRecentSoundRecords: (patientId, limit = 5) => {
        const sessions = get().getSessionsForPatient(patientId);
        return sessions.slice(0, limit).map((s) => ({
          sessionId: s.id,
          deviceId: s.signalSource === 'wearable' ? 'esp32' : 'phone',
          createdAt: s.startedAt,
          durationSec: s.cnnOutput?.signalQuality.durationSec ?? 0,
          qualityScore: s.cnnOutput?.signalQuality.qualityScore ?? 0,
          topLabel: s.cnnOutput?.classProbabilities
            ? Object.entries(s.cnnOutput.classProbabilities).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'Unknown'
            : 'Unknown',
          pneumoniaRiskBucket: s.cnnOutput?.pneumoniaRiskBucket ?? 'low',
          doctorEscalationRecommended: s.cnnOutput?.guardrails.requiresDoctorEscalation ?? false,
        }));
      },

      getHighRiskPatients: () => {
        const { patients, sessions } = get();
        const highRiskPatientIds = new Set(
          sessions.filter((s) => s.cnnOutput?.pneumoniaRiskBucket === 'high').map((s) => s.patientId)
        );
        return patients.filter((p) => highRiskPatientIds.has(p.id));
      },

      getTodaySessionCount: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().sessions.filter((s) => s.startedAt.startsWith(today)).length;
      },

      syncFromServer: async (token) => {
        set({ isSyncing: true });
        try {
          const serverPatients = await apiFetchPatients(token);
          const localPatients = serverPatients.map(serverToLocal);
          const existingIds = new Set(localPatients.map((p) => p.id));
          const offlineOnly = get().patients.filter((p) => !existingIds.has(p.id));
          set({ patients: [...localPatients, ...offlineOnly] });
        } catch (err) {
          console.warn('Failed to sync patients from server:', err);
        } finally {
          set({ isSyncing: false });
        }
      },

      addPatientWithSync: async (patient, token) => {
        try {
          const payload = localToServerPayload(patient);
          const created = await apiCreatePatient(payload, token);
          const withServerId: Patient = { ...patient, id: String(created.id) };
          set((s) => ({ patients: [...s.patients, withServerId] }));
        } catch (err) {
          console.warn('Server create failed, adding locally:', err);
          set((s) => ({ patients: [...s.patients, patient] }));
        }
      },

      removePatientWithSync: async (id, token) => {
        try {
          await apiDeletePatient(Number(id), token);
        } catch (err) {
          console.warn('Server delete failed:', err);
        }
        set((s) => ({ patients: s.patients.filter((p) => p.id !== id) }));
      },
    }),
    {
      name: 'pneumoscan-patients',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        patients: state.patients,
        sessions: state.sessions,
        selectedPatientId: state.selectedPatientId,
      }),
    }
  )
);
