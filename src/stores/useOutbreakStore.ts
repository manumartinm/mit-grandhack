import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OutbreakAlert } from '../types';

interface OutbreakStore {
  alerts: OutbreakAlert[];
  addAlert: (alert: OutbreakAlert) => void;
  acknowledgeAlert: (id: string) => void;
  getActiveAlerts: () => OutbreakAlert[];
}

export const useOutbreakStore = create<OutbreakStore>()(
  persist(
    (set, get) => ({
      alerts: [],

      addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),

      acknowledgeAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
        })),

      getActiveAlerts: () => get().alerts.filter((a) => !a.acknowledged),
    }),
    {
      name: 'pneumoscan-outbreak',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
