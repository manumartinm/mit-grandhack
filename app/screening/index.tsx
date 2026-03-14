import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { Header, Button } from '../../src/components';
import { usePatientStore } from '../../src/stores/usePatientStore';
import { useBleStore } from '../../src/stores/useBleStore';
import { bleService } from '../../src/features/ble/bleService';
import { coughRecorder } from '../../src/features/audio/coughRecorder';
import { modelRunner } from '../../src/features/inference/modelRunner';
import { fuseSignals } from '../../src/features/audio/dualSignalFusion';
import type { ScreeningSession, SignalSource } from '../../src/types';

type Step = 'connect' | 'recording' | 'cough' | 'analyzing' | 'done';

async function getGpsCoords(): Promise<{ lat: number; lon: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: loc.coords.latitude, lon: loc.coords.longitude };
  } catch {
    return null;
  }
}

export default function ScreeningScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const selectedPatientId = usePatientStore((s) => s.selectedPatientId);
  const patient = usePatientStore((s) => s.patients.find((p) => p.id === selectedPatientId));
  const addSession = usePatientStore((s) => s.addSession);
  const getRecentSoundRecords = usePatientStore((s) => s.getRecentSoundRecords);
  const appendAudioChunk = useBleStore((s) => s.appendAudioChunk);
  const audioBuffer = useBleStore((s) => s.audioBuffer);
  const clearAudioBuffer = useBleStore((s) => s.clearAudioBuffer);

  const [step, setStep] = useState<Step>('connect');
  const [signalSource, setSignalSource] = useState<SignalSource>('wearable');
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [coughUri, setCoughUri] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    bleService.initialize();
    getGpsCoords().then((coords) => {
      gpsRef.current = coords;
    });
    return () => {
      bleService.stopStreaming();
      pulseLoopRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startPulse = () => {
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();
  };

  const handleConnectWearable = async () => {
    setSignalSource('wearable');
    await bleService.startScan((device) => {
      useBleStore.getState().addDevice(device);
      bleService.stopScan();
      bleService.connect(device.id).then(() => startRecording('wearable'));
    });
  };

  const handlePhoneMic = () => {
    setSignalSource('phone_mic');
    startRecording('phone_mic');
  };

  const startRecording = (source: SignalSource) => {
    setStep('recording');
    clearAudioBuffer();
    setRecordingDuration(0);
    setWaveformData([]);
    startPulse();

    if (source === 'wearable' || source === 'dual_fused') {
      bleService.startStreaming((chunk) => {
        appendAudioChunk(chunk);
        setWaveformData((prev) => [...prev.slice(-200), ...chunk.slice(0, 10)]);
      });
    }

    timerRef.current = setInterval(() => {
      setRecordingDuration((d) => {
        if (d >= 20) {
          stopRecording();
          return d;
        }
        if (source === 'phone_mic') {
          const mockChunk = Array.from({ length: 10 }, () => Math.random() * 255);
          setWaveformData((prev) => [...prev.slice(-200), ...mockChunk]);
        }
        return d + 1;
      });
    }, 1000);
  };

  const stopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    await bleService.stopStreaming();
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
    setStep('cough');
  };

  const handleCoughCapture = async () => {
    await coughRecorder.startRecording();
    setTimeout(async () => {
      const uri = await coughRecorder.stopRecording();
      setCoughUri(uri);
      runAnalysis();
    }, 5000);
  };

  const skipCough = () => {
    runAnalysis();
  };

  const runAnalysis = async () => {
    setStep('analyzing');

    const audioData = signalSource !== 'phone_mic' ? audioBuffer : waveformData;
    const wearableResult = await modelRunner.runInference(audioData);
    const coughResult = coughUri ? await modelRunner.runInference([]) : null;
    const prevRecords = selectedPatientId ? getRecentSoundRecords(selectedPatientId) : [];
    const sessionId = `session-${Date.now()}`;
    const cnnOutput = fuseSignals(
      {
        ...wearableResult,
        signalQuality: {
          qualityScore: 0.85,
          noiseFloorDb: -45,
          clippingRatio: 0.02,
          durationSec: recordingDuration,
        },
      },
      coughResult
        ? {
            ...coughResult,
            signalQuality: {
              qualityScore: 0.75,
              noiseFloorDb: -38,
              clippingRatio: 0.03,
              durationSec: 5,
            },
          }
        : null,
      sessionId,
      selectedPatientId ?? 'unknown',
      prevRecords
    );

    const effectiveSource =
      coughResult && wearableResult
        ? 'dual_fused'
        : signalSource === 'phone_mic'
          ? 'phone_mic'
          : cnnOutput.signalSource;

    const gps = gpsRef.current;

    const session: ScreeningSession = {
      id: sessionId,
      patientId: selectedPatientId ?? 'unknown',
      ashaWorkerId: 'user',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      signalSource: effectiveSource,
      cnnOutput: { ...cnnOutput, signalSource: effectiveSource },
      symptoms: [],
      notes: '',
      gpsLat: gps?.lat,
      gpsLon: gps?.lon,
    };

    addSession(session);
    setStep('done');
    router.replace('/screening/results');
  };

  return (
    <View style={styles.container}>
      <Header title={t('screening.title')} subtitle={patient?.name} showBack />

      {step === 'connect' && (
        <View style={styles.center}>
          <View style={styles.deviceIcon}>
            <Text style={styles.deviceEmoji}>&#x1FAC1;</Text>
          </View>
          <Text style={styles.instruction}>
            Connect your wearable device or use the phone microphone
          </Text>
          <Button title={t('screening.connectDevice')} onPress={handleConnectWearable} style={styles.btn} />
          <Button title={t('screening.usePhoneMic')} onPress={handlePhoneMic} variant="secondary" style={styles.btn} />
        </View>
      )}

      {step === 'recording' && (
        <View style={styles.center}>
          <Animated.View style={[styles.recordCircle, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.recordDot} />
          </Animated.View>
          <Text style={styles.recordLabel}>{t('screening.recording')}</Text>
          <Text style={styles.timer}>{recordingDuration}s / 20s</Text>
          <View style={styles.waveform}>
            {waveformData.slice(-80).map((v, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: Math.max(4, (v / 255) * 50),
                    opacity: 0.3 + (i / 80) * 0.7,
                  },
                ]}
              />
            ))}
          </View>
          <Text style={styles.qualityGood}>&#x25CF; {t('screening.qualityGood')}</Text>
          {recordingDuration >= 10 && (
            <Button title="Stop & Continue" onPress={stopRecording} variant="secondary" style={styles.btn} />
          )}
        </View>
      )}

      {step === 'cough' && (
        <View style={styles.center}>
          <Text style={styles.coughIcon}>&#x1F5E3;</Text>
          <Text style={styles.instruction}>{t('screening.coughPrompt')}</Text>
          <Button title="Record Cough (5s)" onPress={handleCoughCapture} style={styles.btn} />
          <Button title="Skip Cough Analysis" onPress={skipCough} variant="ghost" style={styles.btn} />
        </View>
      )}

      {step === 'analyzing' && (
        <View style={styles.center}>
          <Text style={styles.analyzingIcon}>&#x23F3;</Text>
          <Text style={styles.recordLabel}>{t('screening.analyzing')}</Text>
          <Text style={styles.sub}>Running AI lung sound analysis...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deviceIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  deviceEmoji: { fontSize: 40 },
  instruction: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 23,
  },
  btn: { marginBottom: 10, width: '100%' },
  recordCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  recordDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#DC2626' },
  recordLabel: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 4 },
  timer: { fontSize: 36, fontWeight: '700', color: '#0D9488', marginBottom: 20 },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 52,
    gap: 2,
    marginBottom: 12,
    width: '100%',
    justifyContent: 'center',
  },
  bar: { width: 3, borderRadius: 1.5, backgroundColor: '#0D9488' },
  qualityGood: { fontSize: 13, color: '#059669', fontWeight: '500' },
  coughIcon: { fontSize: 52, marginBottom: 16 },
  analyzingIcon: { fontSize: 44, marginBottom: 12 },
  sub: { fontSize: 14, color: '#6B7280', marginTop: 4 },
});
