import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OutbreakAlert } from "../types";

const STORAGE_KEY = "pneumoscan-outbreak";

interface OutbreakState {
  alerts: OutbreakAlert[];
}

interface OutbreakContextValue extends OutbreakState {
  addAlert: (alert: OutbreakAlert) => void;
  acknowledgeAlert: (id: string) => void;
  getActiveAlerts: () => OutbreakAlert[];
}

const OutbreakContext = createContext<OutbreakContextValue | undefined>(
  undefined,
);

export function OutbreakProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<OutbreakAlert[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          if (stored.alerts) setAlerts(stored.alerts);
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
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ alerts })).catch(
      () => {},
    );
  }, [alerts]);

  const addAlert = useCallback((alert: OutbreakAlert) => {
    setAlerts((prev) => [...prev, alert]);
  }, []);

  const acknowledgeAlert = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    );
  }, []);

  const getActiveAlerts = useCallback(
    (): OutbreakAlert[] => alerts.filter((a) => !a.acknowledged),
    [alerts],
  );

  return (
    <OutbreakContext.Provider
      value={{ alerts, addAlert, acknowledgeAlert, getActiveAlerts }}
    >
      {children}
    </OutbreakContext.Provider>
  );
}

export function useOutbreak(): OutbreakContextValue {
  const ctx = useContext(OutbreakContext);
  if (!ctx) throw new Error("useOutbreak must be used within OutbreakProvider");
  return ctx;
}
