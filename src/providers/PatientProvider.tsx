import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  MedicalRecord,
  MedicalRecordType,
  Patient,
  RecentSoundRecord,
  ScreeningSession,
} from "../types";
import {
  createMedicalRecord as apiCreateMedicalRecord,
  fetchPatients as apiFetchPatients,
  fetchMedicalRecords as apiFetchMedicalRecords,
  createPatient as apiCreatePatient,
  deleteMedicalRecord as apiDeleteMedicalRecord,
  deletePatient as apiDeletePatient,
  createSession as apiCreateSession,
  updateSession as apiUpdateSession,
  type CreateMedicalRecordPayload,
  type CreateSessionPayload,
  type ServerPatient,
  type ServerMedicalRecord,
  type CreatePatientPayload,
} from "../services/patientApi";
import { isLikelyOfflineError } from "../config/api";
import { useNetwork } from "./NetworkProvider";
import { useAuth } from "./AuthProvider";

const STORAGE_KEY = "pneumoscan-patients";

interface PatientState {
  patients: Patient[];
  sessions: ScreeningSession[];
  medicalRecordsByPatient: Record<string, MedicalRecord[]>;
  selectedPatientId: string | null;
  isSyncing: boolean;
}

interface PatientContextValue extends PatientState {
  addPatient: (patient: Patient) => void;
  selectPatient: (id: string | null) => void;
  getPatient: (id: string) => Patient | undefined;
  addSession: (session: ScreeningSession) => void;
  updateSession: (id: string, updates: Partial<ScreeningSession>) => void;
  getSessionsForPatient: (patientId: string) => ScreeningSession[];
  getRecentSoundRecords: (
    patientId: string,
    limit?: number,
  ) => RecentSoundRecord[];
  getHighRiskPatients: () => Patient[];
  getTodaySessionCount: () => number;
  getMedicalRecordsForPatient: (patientId: string) => MedicalRecord[];
  addMedicalRecordWithSync: (
    patientId: string,
    input: {
      recordType: MedicalRecordType;
      title: string;
      content: string;
      recordDate?: string;
    },
    token: string,
  ) => Promise<MedicalRecord>;
  removeMedicalRecordWithSync: (
    patientId: string,
    recordId: number,
    token: string,
  ) => Promise<void>;
  syncMedicalRecords: (patientId: string, token: string) => Promise<void>;
  syncFromServer: (token: string) => Promise<void>;
  syncLocalPatientsToServer: () => Promise<void>;
  addPatientWithSync: (patient: Patient, token: string) => Promise<Patient>;
  removePatientWithSync: (id: string, token: string) => Promise<void>;
}

const PatientContext = createContext<PatientContextValue | undefined>(
  undefined,
);

function serverToLocal(sp: ServerPatient): Patient {
  // Extended fields may be in the notes JSON blob (older records) or in
  // the dedicated columns (new records). Dedicated columns take priority.
  let extra: Record<string, any> = {};
  try {
    if (sp.notes) extra = JSON.parse(sp.notes);
  } catch {
    /* notes wasn't JSON */
  }

  return {
    id: String(sp.id),
    name: sp.full_name,
    age: sp.age_years ?? extra.age ?? 0,
    sex:
      (extra.sex as Patient["sex"]) ?? (sp.gender as Patient["sex"]) ?? "other",
    village: sp.village ?? extra.village ?? "",
    ashaWorkerId: sp.asha_worker_id ?? extra.ashaWorkerId ?? "",
    comorbidities: extra.comorbidities ?? [],
    vaccinations: extra.vaccinations ?? [],
    medications: extra.medications ?? [],
    allergies: extra.allergies ?? [],
    priorDiagnoses: extra.priorDiagnoses ?? [],
    weight: sp.weight_kg ?? extra.weight,
    createdAt: sp.created_at,
    updatedAt: sp.updated_at,
  };
}

function localToCreatePayload(p: Patient): CreatePatientPayload {
  // Store dedicated columns AND keep a notes JSON blob for extended fields
  // (comorbidities, vaccinations, etc.) that have no dedicated DB column.
  const notes = JSON.stringify({
    sex: p.sex,
    comorbidities: p.comorbidities,
    vaccinations: p.vaccinations,
    medications: p.medications,
    allergies: p.allergies,
    priorDiagnoses: p.priorDiagnoses,
  });
  return {
    full_name: p.name,
    gender: p.sex,
    age_years: p.age,
    village: p.village,
    asha_worker_id: p.ashaWorkerId,
    weight_kg: p.weight,
    notes,
  };
}

function localSessionToPayload(s: ScreeningSession): CreateSessionPayload {
  return {
    id: s.id,
    asha_worker_id: s.ashaWorkerId || null,
    started_at: s.startedAt,
    completed_at: s.completedAt || null,
    signal_source: s.signalSource || null,
    risk_bucket: s.cnnOutput?.pneumoniaRiskBucket || null,
    confidence: s.cnnOutput?.confidence ?? null,
    requires_escalation:
      s.cnnOutput?.guardrails.requiresDoctorEscalation ?? false,
    cnn_output: (s.cnnOutput as unknown as Record<string, any>) ?? null,
    symptoms: s.symptoms,
    zone_results: (s.zoneResults as unknown as Record<string, any>[]) ?? null,
    notes: s.notes || null,
    gps_lat: s.gpsLat ?? null,
    gps_lon: s.gpsLon ?? null,
    referral_status: s.referralStatus || null,
    referral_timestamp: s.referralTimestamp || null,
  };
}

function serverMedicalToLocal(rec: ServerMedicalRecord): MedicalRecord {
  return {
    id: rec.id,
    patientId: rec.patient_id,
    recordType: rec.record_type,
    title: rec.title,
    content: rec.content,
    recordDate: rec.record_date ?? undefined,
    createdAt: rec.created_at,
  };
}

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const { isConnected } = useNetwork();
  const { token, isAuthenticated, user: authUser } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sessions, setSessions] = useState<ScreeningSession[]>([]);
  const [medicalRecordsByPatient, setMedicalRecordsByPatient] = useState<
    Record<string, MedicalRecord[]>
  >({});
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const hydrated = useRef(false);
  const prevAuthUserIdRef = useRef<number | null | undefined>(undefined);
  // Keep refs so the auto-sync effect can read current state without
  // being added to its dependency array (avoids re-running on every change).
  const patientsRef = useRef(patients);
  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          setPatients(stored.patients ?? []);
          setSessions(stored.sessions ?? []);
          setMedicalRecordsByPatient(stored.medicalRecordsByPatient ?? {});
          setSelectedPatientId(stored.selectedPatientId ?? null);
        }
      } catch {
        /* ignore */
      } finally {
        hydrated.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        patients,
        sessions,
        medicalRecordsByPatient,
        selectedPatientId,
      }),
    ).catch(() => {});
  }, [patients, sessions, medicalRecordsByPatient, selectedPatientId]);

  // Prevent cross-user cache reuse after account switch/sign-out.
  useEffect(() => {
    if (!hydrated.current) return;
    const currentUserId = authUser?.id ?? null;
    const previousUserId = prevAuthUserIdRef.current;
    if (previousUserId === undefined) {
      prevAuthUserIdRef.current = currentUserId;
      return;
    }
    if (previousUserId !== currentUserId) {
      setPatients([]);
      setSessions([]);
      setMedicalRecordsByPatient({});
      setSelectedPatientId(null);
    }
    prevAuthUserIdRef.current = currentUserId;
  }, [authUser?.id]);

  // Keep selected patient in sync with owned patient list.
  useEffect(() => {
    if (!selectedPatientId) return;
    const exists = patients.some((p) => p.id === selectedPatientId);
    if (!exists) {
      setSelectedPatientId(patients[0]?.id ?? null);
    }
  }, [patients, selectedPatientId]);

  const addPatient = useCallback((patient: Patient) => {
    setPatients((prev) => [...prev, patient]);
  }, []);

  const selectPatient = useCallback((id: string | null) => {
    setSelectedPatientId(id);
  }, []);

  const getPatient = useCallback(
    (id: string) => patients.find((p) => p.id === id),
    [patients],
  );

  const addSession = useCallback(
    (session: ScreeningSession) => {
      setSessions((prev) => [...prev, session]);

      // Online-first: persist immediately when possible, otherwise keep local.
      if (!isConnected || !token || !isAuthenticated || !session.cnnOutput) return;
      const numericPatientId = Number(session.patientId);
      if (isNaN(numericPatientId)) return;
      void apiCreateSession(
        numericPatientId,
        localSessionToPayload(session),
        token,
      ).catch(() => {
        // Keep local; periodic sync will retry.
      });
    },
    [isConnected, token, isAuthenticated],
  );

  const updateSession = useCallback(
    (id: string, updates: Partial<ScreeningSession>) => {
      const currentSession = sessionsRef.current.find((s) => s.id === id) ?? null;
      const mergedSession = currentSession
        ? ({ ...currentSession, ...updates } as ScreeningSession)
        : null;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          return { ...s, ...updates };
        }),
      );

      // Online-first update sync; fallback remains local.
      if (!mergedSession || !isConnected || !token || !isAuthenticated) return;
      const numericPatientId = Number(mergedSession.patientId);
      if (isNaN(numericPatientId) || !mergedSession.cnnOutput) return;
      void apiUpdateSession(
        numericPatientId,
        mergedSession.id,
        localSessionToPayload(mergedSession),
        token,
      ).catch(() => {
        // Keep local; periodic sync will retry.
      });
    },
    [isConnected, token, isAuthenticated],
  );

  const getSessionsForPatient = useCallback(
    (patientId: string): ScreeningSession[] =>
      sessions
        .filter((s) => s.patientId === patientId)
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        ),
    [sessions],
  );

  const getRecentSoundRecords = useCallback(
    (patientId: string, limit = 5): RecentSoundRecord[] =>
      sessions
        .filter((s) => s.patientId === patientId && s.cnnOutput)
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, limit)
        .map((s) => ({
          sessionId: s.id,
          deviceId: s.signalSource,
          createdAt: s.startedAt,
          durationSec: s.cnnOutput!.signalQuality.durationSec,
          qualityScore: s.cnnOutput!.signalQuality.qualityScore,
          topLabel:
            Object.entries(s.cnnOutput!.classProbabilities).sort(
              ([, a], [, b]) => b - a,
            )[0]?.[0] ?? "unknown",
          pneumoniaRiskBucket: s.cnnOutput!.pneumoniaRiskBucket,
          doctorEscalationRecommended:
            s.cnnOutput!.guardrails.requiresDoctorEscalation,
        })),
    [sessions],
  );

  const getHighRiskPatients = useCallback((): Patient[] => {
    const highRiskPatientIds = new Set(
      sessions
        .filter((s) => s.cnnOutput?.pneumoniaRiskBucket === "high")
        .map((s) => s.patientId),
    );
    return patients.filter((p) => highRiskPatientIds.has(p.id));
  }, [patients, sessions]);

  const getTodaySessionCount = useCallback((): number => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return sessions.filter((s) => new Date(s.startedAt) >= todayStart).length;
  }, [sessions]);

  const getMedicalRecordsForPatient = useCallback(
    (patientId: string): MedicalRecord[] =>
      medicalRecordsByPatient[patientId] ?? [],
    [medicalRecordsByPatient],
  );

  const syncMedicalRecords = useCallback(
    async (patientId: string, token: string) => {
      const numericId = Number(patientId);
      if (!isConnected || !patientId || isNaN(numericId)) return;
      const records = await apiFetchMedicalRecords(numericId, token);
      const mapped = records.map(serverMedicalToLocal);
      setMedicalRecordsByPatient((prev) => ({ ...prev, [patientId]: mapped }));
    },
    [isConnected],
  );

  const addMedicalRecordWithSync = useCallback(
    async (
      patientId: string,
      input: {
        recordType: MedicalRecordType;
        title: string;
        content: string;
        recordDate?: string;
      },
      token: string,
    ): Promise<MedicalRecord> => {
      const localRecord: MedicalRecord = {
        id: Date.now(),
        patientId: Number(patientId),
        recordType: input.recordType,
        title: input.title,
        content: input.content,
        recordDate: input.recordDate,
        createdAt: new Date().toISOString(),
      };

      if (!isConnected) {
        setMedicalRecordsByPatient((prev) => ({
          ...prev,
          [patientId]: [localRecord, ...(prev[patientId] ?? [])],
        }));
        return localRecord;
      }

      const payload: CreateMedicalRecordPayload = {
        record_type: input.recordType,
        title: input.title,
        content: input.content,
        ...(input.recordDate ? { record_date: input.recordDate } : {}),
      };

      const numericPatientId = Number(patientId);
      if (isNaN(numericPatientId)) {
        // Patient was created locally and has no server ID yet — save offline only
        setMedicalRecordsByPatient((prev) => ({
          ...prev,
          [patientId]: [localRecord, ...(prev[patientId] ?? [])],
        }));
        return localRecord;
      }
      const created = await apiCreateMedicalRecord(
        numericPatientId,
        payload,
        token,
      );
      const synced = serverMedicalToLocal(created);
      setMedicalRecordsByPatient((prev) => ({
        ...prev,
        [patientId]: [synced, ...(prev[patientId] ?? [])],
      }));
      return synced;
    },
    [isConnected],
  );

  const removeMedicalRecordWithSync = useCallback(
    async (patientId: string, recordId: number, token: string) => {
      if (!isConnected) {
        setMedicalRecordsByPatient((prev) => ({
          ...prev,
          [patientId]: (prev[patientId] ?? []).filter((r) => r.id !== recordId),
        }));
        return;
      }

      const numericPatientId = Number(patientId);
      if (isNaN(numericPatientId)) return;
      await apiDeleteMedicalRecord(numericPatientId, recordId, token);
      setMedicalRecordsByPatient((prev) => ({
        ...prev,
        [patientId]: (prev[patientId] ?? []).filter((r) => r.id !== recordId),
      }));
    },
    [isConnected],
  );

  const syncLocalPatientsToServer = useCallback(async () => {
    if (!isConnected || !token) return;
    const localPatients = patientsRef.current.filter((p) =>
      p.id.startsWith("local-"),
    );
    if (localPatients.length === 0) return;

    setIsSyncing(true);
    try {
      for (const lp of localPatients) {
        try {
          const created = await apiCreatePatient(
            localToCreatePayload(lp),
            token,
          );
          const newId = String(created.id);
          const oldId = lp.id;

          setPatients((prev) =>
            prev.map((p) =>
              p.id === oldId
                ? {
                    ...p,
                    id: newId,
                    createdAt: created.created_at,
                    updatedAt: created.updated_at,
                  }
                : p,
            ),
          );
          setSessions((prev) =>
            prev.map((s) =>
              s.patientId === oldId ? { ...s, patientId: newId } : s,
            ),
          );
          setMedicalRecordsByPatient((prev) => {
            if (!prev[oldId]) return prev;
            const { [oldId]: recs, ...rest } = prev;
            return { ...rest, [newId]: recs };
          });
          setSelectedPatientId((prev) => (prev === oldId ? newId : prev));
        } catch {
          // Skip this patient; will retry on next sync cycle.
        }
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isConnected, token]);

  // Auto-sync: when the app comes online or the user authenticates,
  // push any locally-created patients to the server, then pull the full list.
  const prevSyncKeyRef = useRef<string>("");
  useEffect(() => {
    if (!isConnected || !token || !isAuthenticated || !hydrated.current) return;
    const key = `${token}`;
    if (prevSyncKeyRef.current === key) return;
    prevSyncKeyRef.current = key;

    (async () => {
      setIsSyncing(true);
      try {
        // 1. Push local-only patients to the server first.
        const localPats = patientsRef.current.filter((p) =>
          p.id.startsWith("local-"),
        );
        for (const lp of localPats) {
          try {
            const created = await apiCreatePatient(
              localToCreatePayload(lp),
              token,
            );
            const newId = String(created.id);
            const oldId = lp.id;
            setPatients((prev) =>
              prev.map((p) =>
                p.id === oldId
                  ? {
                      ...p,
                      id: newId,
                      createdAt: created.created_at,
                      updatedAt: created.updated_at,
                    }
                  : p,
              ),
            );
            setSessions((prev) =>
              prev.map((s) =>
                s.patientId === oldId ? { ...s, patientId: newId } : s,
              ),
            );
            setMedicalRecordsByPatient((prev) => {
              if (!prev[oldId]) return prev;
              const { [oldId]: recs, ...rest } = prev;
              return { ...rest, [newId]: recs };
            });
            setSelectedPatientId((prev) => (prev === oldId ? newId : prev));
          } catch {
            /* skip */
          }
        }
        // 2. Pull the authoritative patient list from the server.
        const serverPatients = await apiFetchPatients(token);
        const mapped = serverPatients.map(serverToLocal);
        setPatients((prev) => {
          const serverIds = new Set(mapped.map((p) => p.id));
          const stillLocal = prev.filter(
            (p) => p.id.startsWith("local-") && !serverIds.has(p.id),
          );
          return [...mapped, ...stillLocal];
        });
        const ownedIds = new Set(mapped.map((p) => p.id));
        setSelectedPatientId((prev) =>
          prev && ownedIds.has(prev) ? prev : mapped[0]?.id ?? null,
        );

        // 3. Push any screening sessions that only exist locally.
        //    We use the current sessions ref to avoid stale closure issues.
        const currentSessions = sessionsRef.current;
        for (const s of currentSessions) {
          const numericPatientId = parseInt(s.patientId, 10);
          if (
            isNaN(numericPatientId) ||
            !s.cnnOutput ||
            !ownedIds.has(String(numericPatientId))
          ) {
            continue;
          }
          try {
            await apiCreateSession(numericPatientId, localSessionToPayload(s), token);
          } catch {
            /* skip — will retry next sync */
          }
        }
      } catch {
        /* network error — will retry next time */
      } finally {
        setIsSyncing(false);
      }
    })();
    // isConnected changes reset the key so reconnecting triggers a fresh sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, token, isAuthenticated]);

  // Reset the sync key when connectivity drops so that reconnecting re-triggers.
  useEffect(() => {
    if (!isConnected) prevSyncKeyRef.current = "";
  }, [isConnected]);

  const syncFromServer = useCallback(
    async (token: string) => {
      if (!isConnected) return;
      setIsSyncing(true);
      try {
        const serverPatients = await apiFetchPatients(token);
        const mapped = serverPatients.map(serverToLocal);

        setPatients((prev) => {
          const serverIds = new Set(mapped.map((p) => p.id));
          const localOnly = prev.filter(
            (p) => p.id.startsWith("local-") && !serverIds.has(p.id),
          );
          return [...mapped, ...localOnly];
        });
        const ownedIds = new Set(mapped.map((p) => p.id));
        setSelectedPatientId((prev) =>
          prev && ownedIds.has(prev) ? prev : mapped[0]?.id ?? null,
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [isConnected],
  );

  const addPatientWithSync = useCallback(
    async (patient: Patient, token: string): Promise<Patient> => {
      setIsSyncing(true);
      try {
        if (!isConnected) {
          setPatients((prev) => [...prev, patient]);
          return patient;
        }
        const payload = localToCreatePayload(patient);
        const created = await apiCreatePatient(payload, token);
        const synced: Patient = {
          ...patient,
          id: String(created.id),
          createdAt: created.created_at,
          updatedAt: created.updated_at,
        };
        setPatients((prev) => [...prev, synced]);
        return synced;
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          setPatients((prev) => [...prev, patient]);
          return patient;
        }
        throw error;
      } finally {
        setIsSyncing(false);
      }
    },
    [isConnected],
  );

  const removePatientWithSync = useCallback(
    async (id: string, token: string) => {
      setIsSyncing(true);
      try {
        if (!isConnected) {
          setPatients((prev) => prev.filter((p) => p.id !== id));
          return;
        }
        await apiDeletePatient(Number(id), token);
        setPatients((prev) => prev.filter((p) => p.id !== id));
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          setPatients((prev) => prev.filter((p) => p.id !== id));
          return;
        }
        throw error;
      } finally {
        setIsSyncing(false);
      }
    },
    [isConnected],
  );

  return (
    <PatientContext.Provider
      value={{
        patients,
        sessions,
        medicalRecordsByPatient,
        selectedPatientId,
        isSyncing,
        addPatient,
        selectPatient,
        getPatient,
        addSession,
        updateSession,
        getSessionsForPatient,
        getRecentSoundRecords,
        getHighRiskPatients,
        getTodaySessionCount,
        getMedicalRecordsForPatient,
        addMedicalRecordWithSync,
        removeMedicalRecordWithSync,
        syncMedicalRecords,
        syncFromServer,
        syncLocalPatientsToServer,
        addPatientWithSync,
        removePatientWithSync,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatients(): PatientContextValue {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatients must be used within PatientProvider");
  return ctx;
}
