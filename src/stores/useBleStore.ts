import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BleDevice, BleConnectionState } from '../types';

interface BleStore {
  devices: BleDevice[];
  connectedDevice: BleDevice | null;
  connectionState: BleConnectionState;
  isStreaming: boolean;
  audioBuffer: number[];
  streamStartedAt: string | null;

  setConnectionState: (state: BleConnectionState) => void;
  addDevice: (device: BleDevice) => void;
  setConnectedDevice: (device: BleDevice | null) => void;
  setStreaming: (streaming: boolean) => void;
  appendAudioChunk: (chunk: number[]) => void;
  clearAudioBuffer: () => void;
  resetBle: () => void;
}

export const useBleStore = create<BleStore>()(
  persist(
    (set) => ({
      devices: [],
      connectedDevice: null,
      connectionState: 'disconnected',
      isStreaming: false,
      audioBuffer: [],
      streamStartedAt: null,

      setConnectionState: (connectionState) => set({ connectionState }),

      addDevice: (device) =>
        set((s) => {
          const existing = s.devices.findIndex((d) => d.id === device.id);
          if (existing >= 0) {
            const devices = [...s.devices];
            devices[existing] = device;
            return { devices };
          }
          return { devices: [...s.devices, device] };
        }),

      setConnectedDevice: (device) =>
        set({
          connectedDevice: device,
          connectionState: device ? 'connected' : 'disconnected',
        }),

      setStreaming: (isStreaming) =>
        set({
          isStreaming,
          streamStartedAt: isStreaming ? new Date().toISOString() : null,
        }),

      appendAudioChunk: (chunk) =>
        set((s) => ({ audioBuffer: [...s.audioBuffer, ...chunk] })),

      clearAudioBuffer: () => set({ audioBuffer: [], streamStartedAt: null }),

      resetBle: () =>
        set({
          devices: [],
          connectedDevice: null,
          connectionState: 'disconnected',
          isStreaming: false,
          audioBuffer: [],
          streamStartedAt: null,
        }),
    }),
    {
      name: 'pneumoscan-ble',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        devices: state.devices,
      }),
    }
  )
);
