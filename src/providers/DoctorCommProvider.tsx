import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../config/api";
import { useAuth } from "./AuthProvider";
import type {
  CallSession,
  CallStatus,
  DoctorProfile,
  DoctorThread,
} from "../types";

interface DoctorCommContextValue {
  doctors: DoctorProfile[];
  activeDoctor: DoctorProfile | null;
  thread: DoctorThread;
  callSession: CallSession | null;
  isLoading: boolean;
  selectDoctor: (doctorId: string) => void;
  sendPatientMessage: (content: string, patientId: string) => Promise<void>;
  requestCall: (patientId: string) => Promise<CallSession>;
  endCall: () => Promise<void>;
}

const DoctorCommContext = createContext<DoctorCommContextValue | undefined>(
  undefined,
);

const DEFAULT_DOCTORS: DoctorProfile[] = [];

const EMPTY_THREAD: DoctorThread = {
  id: "",
  doctorId: "",
  patientId: "",
  messages: [],
};

function toCallStatus(value: unknown): CallStatus {
  switch (value) {
    case "idle":
    case "requesting":
    case "ringing":
    case "connected":
    case "ended":
    case "pending":
    case "accepted":
    case "cancelled":
      return value;
    default:
      return "requesting";
  }
}

export function DoctorCommProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, user } = useAuth();
  const [doctors, setDoctors] = useState<DoctorProfile[]>(DEFAULT_DOCTORS);
  const [activeDoctorId, setActiveDoctorId] = useState<string>("");
  const [thread, setThread] = useState<DoctorThread>(EMPTY_THREAD);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const conversationIdRef = useRef<number | null>(null);

  const activeDoctor = doctors.find((d) => d.id === activeDoctorId) ?? null;

  useEffect(() => {
    if (!token || !user) {
      setDoctors(DEFAULT_DOCTORS);
      setActiveDoctorId("");
      return;
    }

    apiFetch("/auth/users?role=doctor", {}, token)
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (
          rows: Array<{
            id: number;
            full_name: string;
            phone?: string | null;
          }>,
        ) => {
          const mapped: DoctorProfile[] = rows.map((row) => ({
            id: String(row.id),
            name: row.full_name,
            specialty: "General Physician",
            phone: row.phone ?? "-",
            online: true,
          }));

          const fallback =
            mapped.length > 0
              ? mapped
              : [
                  {
                    id: String(user.id),
                    name: user.full_name,
                    specialty: "General Physician",
                    phone: "-",
                    online: true,
                  },
                ];

          setDoctors(fallback);
          setActiveDoctorId((prev) => {
            if (prev && fallback.some((d) => d.id === prev)) return prev;
            return fallback[0]?.id ?? "";
          });
        },
      )
      .catch(() => {
        const fallback: DoctorProfile[] = [
          {
            id: String(user.id),
            name: user.full_name,
            specialty: "General Physician",
            phone: "-",
            online: true,
          },
        ];
        setDoctors(fallback);
        setActiveDoctorId(fallback[0].id);
      });
  }, [token, user?.id]);

  // Load or create conversation when active doctor changes
  useEffect(() => {
    if (!token || !activeDoctorId || !user) return;
    conversationIdRef.current = null;
    setThread({ ...EMPTY_THREAD, doctorId: activeDoctorId });

    const doctorIdNum = Number.parseInt(activeDoctorId, 10);
    const patientIdNum = user.id;
    if (Number.isNaN(doctorIdNum)) return;

    apiFetch(
      `/communications/conversations?patient_id=${patientIdNum}&doctor_id=${doctorIdNum}`,
      {},
      token,
    )
      .then((res) => (res.ok ? res.json() : []))
      .then(
        async (
          convos: Array<{
            id: number;
            patient_id: number;
            doctor_id: number;
            created_at: string;
          }>,
        ) => {
          let convId: number;
          if (convos.length > 0) {
            convId = convos[0].id;
          } else {
            const createdRes = await apiFetch(
              "/communications/conversations",
              {
                method: "POST",
                body: JSON.stringify({
                  patient_id: patientIdNum,
                  doctor_id: doctorIdNum,
                }),
              },
              token,
            );
            if (!createdRes.ok) return;
            const created = await createdRes.json();
            if (typeof created.id !== "number") return;
            convId = created.id;
          }
          conversationIdRef.current = convId;

          const msgs = await apiFetch(
            `/communications/conversations/${convId}/messages`,
            {},
            token,
          ).then((r) => (r.ok ? r.json() : []));

          setThread({
            id: String(convId),
            doctorId: activeDoctorId,
            patientId: String(patientIdNum),
            messages: msgs.map(
              (m: {
                id: number;
                sender_role: string;
                content: string;
                created_at: string;
              }) => ({
                id: String(m.id),
                role: m.sender_role as "patient" | "doctor" | "system",
                content: m.content,
                timestamp: m.created_at,
              }),
            ),
          });
        },
      )
      .catch(() => {});
  }, [token, activeDoctorId, user?.id]);

  const selectDoctor = useCallback((doctorId: string) => {
    setActiveDoctorId(doctorId);
  }, []);

  const sendPatientMessage = useCallback(
    async (content: string, patientId: string) => {
      if (!token || !conversationIdRef.current) return;
      const convId = conversationIdRef.current;

      const optimistic = {
        id: `tmp-${Date.now()}`,
        role: "patient" as const,
        content,
        timestamp: new Date().toISOString(),
      };
      setThread((prev) => ({
        ...prev,
        patientId,
        messages: [...prev.messages, optimistic],
      }));

      try {
        const saved = await apiFetch(
          `/communications/conversations/${convId}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ sender_role: "patient", content }),
          },
          token,
        ).then((r) => r.json());

        setThread((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === optimistic.id
              ? {
                  id: String(saved.id),
                  role: "patient" as const,
                  content: saved.content,
                  timestamp: saved.created_at,
                }
              : m,
          ),
        }));
      } catch {
        setThread((prev) => ({
          ...prev,
          messages: prev.messages.filter((m) => m.id !== optimistic.id),
        }));
      }
    },
    [token],
  );

  const requestCall = useCallback(
    async (patientId: string): Promise<CallSession> => {
      const local: CallSession = {
        id: `call-${Date.now()}`,
        doctorId: activeDoctorId ?? "",
        patientId,
        mode: "dialer_now",
        status: "requesting",
        createdAt: new Date().toISOString(),
      };
      setCallSession(local);

      if (token && activeDoctorId && user) {
        const doctorIdNum = Number.parseInt(activeDoctorId, 10);
        if (Number.isNaN(doctorIdNum)) {
          return local;
        }
        try {
          const res = await apiFetch(
            "/communications/call-requests",
            {
              method: "POST",
              body: JSON.stringify({
                patient_id: user.id,
                doctor_id: doctorIdNum,
                mode: "dialer_now",
              }),
            },
            token,
          ).then((r) => r.json());
          const serverCall: CallSession = {
            id: String(res.id),
            doctorId: String(res.doctor_id),
            patientId: String(res.patient_id),
            mode: res.mode === "in_app_later" ? "in_app_later" : "dialer_now",
            status: toCallStatus(res.status),
            createdAt: res.created_at,
          };
          setCallSession(serverCall);
          return serverCall;
        } catch {
          // fall through — return local optimistic session
        }
      }
      return local;
    },
    [token, activeDoctorId, user],
  );

  const endCall = useCallback(async () => {
    if (!callSession) return;
    const callId = Number(callSession.id);
    if (token && !isNaN(callId)) {
      apiFetch(
        `/communications/call-requests/${callId}/cancel`,
        { method: "POST" },
        token,
      ).catch(() => {});
    }
    setCallSession((prev) => (prev ? { ...prev, status: "ended" } : prev));
  }, [token, callSession]);

  return (
    <DoctorCommContext.Provider
      value={{
        doctors,
        activeDoctor,
        thread,
        callSession,
        isLoading,
        selectDoctor,
        sendPatientMessage,
        requestCall,
        endCall,
      }}
    >
      {children}
    </DoctorCommContext.Provider>
  );
}

export function useDoctorComm(): DoctorCommContextValue {
  const ctx = useContext(DoctorCommContext);
  if (!ctx)
    throw new Error("useDoctorComm must be used within DoctorCommProvider");
  return ctx;
}
