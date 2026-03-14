import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { sppService, SppConnectionState, SppDevice } from '../features/spp/sppService';

// ─── Context shape ────────────────────────────────────────────────────────────
interface SppContextValue {
  connectionState: SppConnectionState;
  devices: SppDevice[];
  connectedDeviceName: string | null;
  statusLog: string[];
  recordingProgress: { current: number; total: number } | null;
  audioUri: string | null;
  /** uint8-normalised (0-255) samples from the most recent completed recording */
  zoneSamples: number[] | null;
  error: string | null;
  isAndroid: boolean;

  scan: () => Promise<SppDevice[]>;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendRecord: () => Promise<void>;
  playAudio: () => Promise<void>;
  clearError: () => void;
  clearAudio: () => void;
  clearZoneSamples: () => void;
}

const SppContext = createContext<SppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function SppProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<SppConnectionState>('idle');
  const [devices, setDevices] = useState<SppDevice[]>([]);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [recordingProgress, setRecordingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [zoneSamples, setZoneSamples] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const devicesRef = useRef<SppDevice[]>([]);
  devicesRef.current = devices;

  const isAndroid = Platform.OS === 'android';

  // Wire up service callbacks once on mount
  useEffect(() => {
    if (!isAndroid) return;

    sppService.onStateChange = (state) => {
      setConnectionState(state);
    };

    sppService.onStatusMessage = (msg) => {
      // Keep last 100 messages to avoid unbounded growth
      setStatusLog((prev) => [...prev.slice(-99), msg]);
    };

    sppService.onProgress = (current, total) => {
      setRecordingProgress({ current, total });
    };

    sppService.onZoneSamplesReady = (samples) => {
      setZoneSamples(samples);
    };

    sppService.onAudioReady = (uri) => {
      setAudioUri(uri);
      setRecordingProgress(null);
    };

    sppService.onError = (err) => {
      setError(err);
    };

    return () => {
      sppService.onStateChange = undefined;
      sppService.onStatusMessage = undefined;
      sppService.onProgress = undefined;
      sppService.onZoneSamplesReady = undefined;
      sppService.onAudioReady = undefined;
      sppService.onError = undefined;
    };
  }, [isAndroid]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const scan = useCallback(async (): Promise<SppDevice[]> => {
    setError(null);
    setDevices([]);
    const found = await sppService.scan();
    setDevices(found);
    return found;
  }, []);

  const connect = useCallback(async (deviceId: string) => {
    setError(null);
    setStatusLog([]);
    const device = devicesRef.current.find((d) => d.id === deviceId);
    await sppService.connect(deviceId);
    setConnectedDeviceName(device?.name ?? 'ESP32_MIC');
  }, []);

  const disconnect = useCallback(async () => {
    await sppService.disconnect();
    setConnectedDeviceName(null);
    setAudioUri(null);
    setRecordingProgress(null);
    setStatusLog([]);
  }, []);

  const sendRecord = useCallback(async () => {
    setError(null);
    setAudioUri(null);
    setRecordingProgress({ current: 0, total: 5 });
    await sppService.sendRecord();
  }, []);

  const playAudio = useCallback(async () => {
    if (audioUri) {
      await sppService.playAudio(audioUri);
    }
  }, [audioUri]);

  const clearError = useCallback(() => setError(null), []);
  const clearAudio = useCallback(() => setAudioUri(null), []);
  const clearZoneSamples = useCallback(() => setZoneSamples(null), []);

  return (
    <SppContext.Provider
      value={{
        connectionState,
        devices,
        connectedDeviceName,
        statusLog,
        recordingProgress,
        audioUri,
        zoneSamples,
        error,
        isAndroid,
        scan,
        connect,
        disconnect,
        sendRecord,
        playAudio,
        clearError,
        clearAudio,
        clearZoneSamples,
      }}
    >
      {children}
    </SppContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSpp(): SppContextValue {
  const ctx = useContext(SppContext);
  if (!ctx) throw new Error('useSpp must be used inside <SppProvider>');
  return ctx;
}
