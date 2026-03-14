import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import Svg, { Ellipse, Rect, Circle, Line, Text as SvgText } from "react-native-svg";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { Header, Button } from "../../src/components";
import { usePatients } from "../../src/providers/PatientProvider";
import { useSpp } from "../../src/providers/SppProvider";
import { coughRecorder } from "../../src/features/audio/coughRecorder";
import { modelRunner } from "../../src/features/inference/modelRunner";
import { fuseSignals } from "../../src/features/audio/dualSignalFusion";
import type {
  ScreeningSession,
  SignalSource,
  LungZone,
  ZoneRecordingResult,
  RecordingError,
} from "../../src/types";
import { useReducedMotion } from "react-native-reanimated";

type Step =
  | "connect"
  | "placement"
  | "recording"
  | "zone_feedback"
  | "cough"
  | "analyzing"
  | "done";

// ─── Body position diagram ────────────────────────────────────────────────────

const ZONE_DIAGRAM: Record<LungZone, { side: "front" | "back"; label: string; cx: number; cy: number }> = {
  left_upper_front:  { side: "front", label: "L", cx: 35, cy: 38 },
  right_upper_front: { side: "front", label: "R", cx: 65, cy: 38 },
  left_lower_back:   { side: "back",  label: "L", cx: 35, cy: 60 },
  right_lower_back:  { side: "back",  label: "R", cx: 65, cy: 60 },
};

function BodyDiagram({ zone }: { zone: LungZone }) {
  const info = ZONE_DIAGRAM[zone];
  if (!info) return null;

  // Simple body outline: head + torso
  return (
    <View style={{ alignItems: "center", marginBottom: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: "#2D4E73", marginBottom: 6, letterSpacing: 0.3 }}>
        {info.side === "front" ? "FRONT VIEW" : "BACK VIEW"}
      </Text>
      <Svg width={100} height={120} viewBox="0 0 100 120">
        {/* Head */}
        <Ellipse cx="50" cy="18" rx="14" ry="16" fill="#E8F0F8" stroke="#185FA5" strokeWidth="1.5" />
        {/* Torso */}
        <Rect x="28" y="36" width="44" height="62" rx="10" fill="#E8F0F8" stroke="#185FA5" strokeWidth="1.5" />
        {/* Center line (front only) */}
        {info.side === "front" && (
          <Line x1="50" y1="38" x2="50" y2="96" stroke="#185FA5" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        )}
        {/* Highlighted zone dot */}
        <Circle
          cx={info.cx}
          cy={info.cy}
          r="10"
          fill="#D85A30"
          opacity="0.85"
        />
        {/* Label inside dot */}
        <SvgText
          x={info.cx}
          y={info.cy + 4}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="11"
          fontWeight="700"
        >
          {info.label}
        </SvgText>
      </Svg>
    </View>
  );
}

const LUNG_ZONES: { id: LungZone; label: string; hint: string }[] = [
  {
    id: "left_upper_front",
    label: "Left upper chest",
    hint: "Place stethoscope under left collarbone.",
  },
  {
    id: "right_upper_front",
    label: "Right upper chest",
    hint: "Place stethoscope under right collarbone.",
  },
  {
    id: "left_lower_back",
    label: "Left lower back",
    hint: "Place stethoscope at lower left back near ribs.",
  },
  {
    id: "right_lower_back",
    label: "Right lower back",
    hint: "Place stethoscope at lower right back near ribs.",
  },
];

// Duration the ESP32 records per zone (fixed by firmware)
const SPP_ZONE_DURATION_SEC = 5;

async function getGpsCoords(): Promise<{ lat: number; lon: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
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
  const { selectedPatientId, patients, addSession, getRecentSoundRecords } =
    usePatients();
  const patient = patients.find((p) => p.id === selectedPatientId);
  const spp = useSpp();

  // On Android we connect to the real ESP32_MIC via Classic BT SPP.
  // On iOS there is no Classic BT support, so only phone mic is available.
  const isAndroid = Platform.OS === "android";

  const [step, setStep] = useState<Step>("connect");
  const [signalSource, setSignalSource] = useState<SignalSource>("wearable");
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  // Accumulates uint8-normalised SPP samples across all zones for model inference
  const [wearableAudioBuffer, setWearableAudioBuffer] = useState<number[]>([]);
  const [coughUri, setCoughUri] = useState<string | null>(null);
  const [zoneIndex, setZoneIndex] = useState(0);
  const [zoneResults, setZoneResults] = useState<ZoneRecordingResult[]>([]);
  const [recordingError, setRecordingError] = useState<RecordingError | null>(
    null
  );
  const [isConnecting, setIsConnecting] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  // Phone-mic mock timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // SPP simulated waveform timer
  const sppWaveSimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Belt-and-suspenders UI-side zone timeout
  const sppZoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gpsRef = useRef<{ lat: number; lon: number } | null>(null);
  const zoneBufferRef = useRef<number[]>([]);

  // Stable refs so useEffects can read the latest values without stale closures
  const stepRef = useRef(step);
  const zoneIndexRef = useRef(zoneIndex);
  const signalSourceRef = useRef(signalSource);
  const recordingDurationRef = useRef(recordingDuration);
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { zoneIndexRef.current = zoneIndex; }, [zoneIndex]);
  useEffect(() => { signalSourceRef.current = signalSource; }, [signalSource]);
  useEffect(() => { recordingDurationRef.current = recordingDuration; }, [recordingDuration]);

  const reduceMotion = useReducedMotion();

  // ── Startup & cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    getGpsCoords().then((coords) => {
      gpsRef.current = coords;
    });
    return () => {
      clearAllTimers();
      pulseLoopRef.current?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SPP: react to zone samples arriving from the real ESP32 ──────────────────
  useEffect(() => {
    if (!spp.zoneSamples) return;
    if (stepRef.current !== "recording") return;
    if (signalSourceRef.current !== "wearable") return;

    clearAllTimers();
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;

    const samples = spp.zoneSamples;
    zoneBufferRef.current = samples;
    setWearableAudioBuffer((prev) => [...prev, ...samples]);

    finishZoneWithSamples(samples, SPP_ZONE_DURATION_SEC);
    spp.clearZoneSamples();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spp.zoneSamples]);

  // ── SPP: mirror [REC] progress to the recording timer ───────────────────────
  useEffect(() => {
    if (!spp.recordingProgress) return;
    if (stepRef.current !== "recording") return;
    setRecordingDuration(spp.recordingProgress.current);
  }, [spp.recordingProgress]);

  // ── SPP: connection error during an active recording ────────────────────────
  useEffect(() => {
    if (stepRef.current !== "recording") return;
    if (signalSourceRef.current !== "wearable") return;
    if (spp.connectionState === "error" || spp.connectionState === "idle") {
      abortZoneWithError(
        "Stethoscope connection lost. Please reconnect and try again."
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spp.connectionState, spp.error]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const clearAllTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (sppWaveSimRef.current) {
      clearInterval(sppWaveSimRef.current);
      sppWaveSimRef.current = null;
    }
    if (sppZoneTimeoutRef.current) {
      clearTimeout(sppZoneTimeoutRef.current);
      sppZoneTimeoutRef.current = null;
    }
  };

  const startPulse = () => {
    if (reduceMotion) return;
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current.start();
  };

  /** Shared quality-evaluate → advance-or-retry logic for both paths. */
  const finishZoneWithSamples = (samples: number[], durationSec: number) => {
    const zoneResult = evaluateZoneQuality(
      samples,
      durationSec,
      zoneIndexRef.current
    );
    setZoneResults((prev) => {
      const without = prev.filter((r) => r.zone !== zoneResult.zone);
      return [...without, zoneResult];
    });

    if (zoneIndexRef.current < LUNG_ZONES.length - 1) {
      setZoneIndex((idx) => idx + 1);
      setStep("placement");
      return;
    }
    setStep("cough");
  };

  const abortZoneWithError = (message: string) => {
    clearAllTimers();
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
    setRecordingError({
      code: "ble_disconnected",
      message,
      zone: LUNG_ZONES[zoneIndexRef.current].id,
      recoverable: true,
    });
    setStep("zone_feedback");
  };

  // ── Connect step ─────────────────────────────────────────────────────────────
  const handleConnectEsp32 = async () => {
    setSignalSource("wearable");
    setRecordingError(null);
    setIsConnecting(true);

    try {
      const found = await spp.scan();
      if (found.length === 0) {
        setRecordingError({
          code: "ble_disconnected",
          message:
            "Stethoscope not found. Make sure Bluetooth is on and the device is powered on.",
          recoverable: true,
        });
        return;
      }
      await spp.connect(found[0].id);
      setStep("placement");
    } catch {
      setRecordingError({
        code: "ble_disconnected",
        message:
          "Could not connect to the stethoscope. Try again or use the phone microphone.",
        recoverable: true,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePhoneMic = () => {
    setSignalSource("phone_mic");
    setStep("placement");
  };

  // ── Recording step ───────────────────────────────────────────────────────────
  const startRecording = (source: SignalSource) => {
    setStep("recording");
    setRecordingError(null);
    spp.clearZoneSamples();
    setRecordingDuration(0);
    setWaveformData([]);
    zoneBufferRef.current = [];
    startPulse();

    if (source === "wearable") {
      // ── SPP path: send 'R' to ESP32, drive UI from [REC] callbacks ──────────
      spp.sendRecord();

      // Simulated breathing waveform while waiting for the real audio data
      let waveT = 0;
      sppWaveSimRef.current = setInterval(() => {
        const chunk = Array.from({ length: 10 }, () => {
          const v =
            Math.sin(waveT * 0.04) * 0.35 + (Math.random() - 0.5) * 0.08;
          waveT++;
          return Math.round(v * 64 + 128);
        });
        setWaveformData((prev) => [...prev.slice(-200), ...chunk]);
      }, 20);

      // UI-side safety timeout (sppService already has its own 30s timeout)
      sppZoneTimeoutRef.current = setTimeout(() => {
        abortZoneWithError(
          "Recording timed out. Check the stethoscope is on and placed correctly."
        );
      }, 32_000);
      return;
    }

    // ── Phone mic path: mock waveform + 10s timer ─────────────────────────────
    timerRef.current = setInterval(() => {
      setRecordingDuration((d) => {
        if (d >= 10) {
          stopPhoneMicRecording();
          return d;
        }
        const mockChunk = Array.from(
          { length: 10 },
          () => Math.random() * 255
        );
        zoneBufferRef.current = [...zoneBufferRef.current, ...mockChunk];
        setWaveformData((prev) => [...prev.slice(-200), ...mockChunk]);
        return d + 1;
      });
    }, 1000);
  };

  // ── Quality evaluation ───────────────────────────────────────────────────────
  const evaluateZoneQuality = (
    samples: number[],
    durationSec: number,
    idx: number
  ): ZoneRecordingResult => {
    const zone = LUNG_ZONES[idx].id;
    if (samples.length < 200) {
      return {
        zone,
        qualityScore: 0.25,
        durationSec,
        clippingRatio: 0,
        noiseFloorDb: -20,
        passed: false,
        reason: "weak_signal",
      };
    }
    const clippingCount = samples.filter((s) => s < 4 || s > 251).length;
    const clippingRatio = clippingCount / samples.length;
    const avgAmp =
      samples.reduce((acc, val) => acc + Math.abs(val - 128), 0) /
      samples.length;
    const normalizedAmp = Math.min(avgAmp / 64, 1);
    const qualityScore = Math.max(
      0,
      Math.min(1, normalizedAmp - clippingRatio * 1.4 + durationSec / 20)
    );
    const passed = qualityScore >= 0.55 && clippingRatio <= 0.18;

    return {
      zone,
      qualityScore,
      durationSec,
      clippingRatio,
      noiseFloorDb: -45 + normalizedAmp * 10,
      passed,
      reason: passed
        ? undefined
        : clippingRatio > 0.18
          ? "audio_clipping"
          : "high_noise",
    };
  };

  // ── Stop phone-mic zone recording ────────────────────────────────────────────
  const stopPhoneMicRecording = () => {
    clearAllTimers();
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
    finishZoneWithSamples(zoneBufferRef.current, recordingDurationRef.current);
  };

  // ── Cough step ───────────────────────────────────────────────────────────────
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

  // ── Analysis step ────────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    setStep("analyzing");

    // wearableAudioBuffer = accumulated SPP int16→uint8 samples across all zones
    const audioData =
      signalSource !== "phone_mic" ? wearableAudioBuffer : waveformData;
    const wearableResult = await modelRunner.runInference(audioData);
    const coughResult = coughUri ? await modelRunner.runInference([]) : null;
    const prevRecords = selectedPatientId
      ? getRecentSoundRecords(selectedPatientId)
      : [];
    const sessionId = `session-${Date.now()}`;
    const allZonesCaptured =
      zoneResults.filter((z) => z.passed).length === LUNG_ZONES.length;
    const zoneQuality =
      zoneResults.reduce((sum, current) => sum + current.qualityScore, 0) /
      Math.max(zoneResults.length, 1);
    const serverQ = wearableResult.signalQuality;
    const cnnOutput = fuseSignals(
      {
        ...wearableResult,
        signalQuality: {
          qualityScore: serverQ
            ? Math.max(
                0,
                Math.min(
                  1,
                  1 - (serverQ.clippingRatio + serverQ.silenceRatio) / 2
                )
              )
            : zoneQuality,
          noiseFloorDb: serverQ?.rmsDb ?? -45,
          clippingRatio:
            serverQ?.clippingRatio ??
            Math.max(...zoneResults.map((z) => z.clippingRatio), 0.02),
          durationSec: serverQ?.durationSec ?? recordingDuration,
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
      selectedPatientId ?? "unknown",
      prevRecords,
      { allZonesCaptured }
    );

    const effectiveSource =
      coughResult && wearableResult
        ? "dual_fused"
        : signalSource === "phone_mic"
          ? "phone_mic"
          : cnnOutput.signalSource;

    const gps = gpsRef.current;
    const preprocessWarnings = [
      ...(wearableResult.signalQuality?.warnings ?? []),
      ...(coughResult?.signalQuality?.warnings ?? []),
    ];
    const analysisMetadata = {
      primaryRecordId: wearableResult.recordId,
      primaryCreatedAt: wearableResult.createdAt,
      modelPath: wearableResult.modelPath,
      coughRecordId: coughResult?.recordId,
      zoneResults,
      preprocessWarnings,
      serverSignalQuality: wearableResult.signalQuality,
    };

    const session: ScreeningSession = {
      id: sessionId,
      patientId: selectedPatientId ?? "unknown",
      ashaWorkerId: "user",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      signalSource: effectiveSource,
      cnnOutput: { ...cnnOutput, signalSource: effectiveSource },
      symptoms: [],
      notes: JSON.stringify(analysisMetadata),
      zoneResults,
      gpsLat: gps?.lat,
      gpsLon: gps?.lon,
    };

    addSession(session);
    setStep("done");
    router.replace("/screening/results");
  };

  // ── Derived recording UI values ───────────────────────────────────────────────
  const isReceivingAudio = spp.connectionState === "receiving";
  const isSppRecording =
    signalSource === "wearable" &&
    (spp.connectionState === "recording" ||
      spp.connectionState === "receiving");
  const displayDuration =
    spp.recordingProgress && signalSource === "wearable"
      ? spp.recordingProgress.current
      : recordingDuration;
  const displayTotal =
    signalSource === "wearable" ? SPP_ZONE_DURATION_SEC : 10;
  const scanningOrConnecting =
    spp.connectionState === "scanning" ||
    spp.connectionState === "connecting" ||
    isConnecting;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Header title={t("screening.title")} subtitle={patient?.name} showBack />

      {/* ── Connect ── */}
      {step === "connect" && (
        <View style={styles.center}>
          <View
            style={styles.deviceIcon}
            accessibilityRole="image"
            accessibilityLabel="Stethoscope icon"
          >
            <Text style={styles.deviceEmoji} importantForAccessibility="no">
              &#x1FAC1;
            </Text>
          </View>
          <Text style={styles.stepHeading}>Connect Device</Text>
          <Text style={styles.instruction}>
            Connect the stethoscope device via Bluetooth, then follow the guided steps to record lung sounds.
          </Text>

          {isAndroid ? (
            <Button
              title={scanningOrConnecting ? "Scanning for device…" : "Connect Stethoscope"}
              onPress={handleConnectEsp32}
              style={styles.btn}
              disabled={scanningOrConnecting}
              accessibilityHint="Scans and connects to the stethoscope device via Bluetooth"
            />
          ) : (
            <View style={styles.iosNotice}>
              <Text style={styles.iosNoticeText}>
                Bluetooth stethoscope is not available on iPhone. Use the phone microphone instead.
              </Text>
            </View>
          )}

          <Button
            title="Use Phone Microphone"
            onPress={handlePhoneMic}
            variant="secondary"
            style={styles.btn}
            accessibilityHint="Uses phone microphone when stethoscope device is unavailable"
          />

          {(recordingError || spp.error) && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {spp.error ?? recordingError?.message}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Placement ── */}
      {step === "placement" && (
        <View style={styles.center}>
          <View style={styles.stepPill} accessibilityRole="text" accessibilityLabel={`Step ${zoneIndex + 1} of ${LUNG_ZONES.length}`}>
            <Text style={styles.stepPillText}>Step {zoneIndex + 1} of {LUNG_ZONES.length}</Text>
          </View>
          <Text style={styles.zoneTitle}>{LUNG_ZONES[zoneIndex].label}</Text>
          <BodyDiagram zone={LUNG_ZONES[zoneIndex].id} />
          <View style={styles.hintBox}>
            <Text style={styles.instruction}>{LUNG_ZONES[zoneIndex].hint}</Text>
          </View>
          <Button
            title="Ready — Start Recording"
            onPress={() => startRecording(signalSource)}
            style={styles.btn}
          />
        </View>
      )}

      {/* ── Recording ── */}
      {step === "recording" && (
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.recordCircle,
              { transform: [{ scale: pulseAnim }] },
            ]}
            accessibilityRole="image"
            accessibilityLabel="Recording in progress"
          >
            <View style={styles.recordDot} />
          </Animated.View>

          <Text
            style={styles.recordLabel}
            accessibilityLiveRegion="polite"
            accessibilityLabel={
              isReceivingAudio ? "Receiving audio from device" : "Recording in progress"
            }
          >
            {isReceivingAudio ? "Receiving audio…" : "Recording…"}
          </Text>

          <Text style={styles.timer} accessibilityLiveRegion="polite">
            {displayDuration}s / {displayTotal}s
          </Text>

          <View style={styles.waveform}>
            {waveformData.slice(-60).map((v, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: Math.max(6, (v / 255) * 64),
                    opacity: 0.35 + (i / 60) * 0.65,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.qualityRow}>
            <View style={styles.qualityDot} importantForAccessibility="no" />
            <Text style={styles.qualityGood} accessibilityLabel="Signal quality good">
              {isSppRecording ? "Stethoscope connected — recording" : "Microphone active — recording"}
            </Text>
          </View>

          {!isSppRecording && recordingDuration >= 5 && (
            <Button
              title="Stop & Continue"
              onPress={stopPhoneMicRecording}
              variant="secondary"
              style={styles.btn}
            />
          )}
        </View>
      )}

      {/* ── Zone feedback / retry ── */}
      {step === "zone_feedback" && (
        <View style={styles.center}>
          <View style={styles.warnCircle} accessibilityRole="image" accessibilityLabel="Warning">
            <Text style={styles.warnCircleText}>!</Text>
          </View>
          <Text style={styles.stepHeading}>Recording needs retry</Text>
          <View style={styles.hintBox}>
            <Text style={styles.instruction}>{recordingError?.message}</Text>
          </View>
          <Button
            title="Retry this position"
            onPress={() => {
              setRecordingError(null);
              startRecording(signalSource);
            }}
            style={styles.btn}
          />
          <Button
            title="Back to placement guide"
            variant="secondary"
            onPress={() => setStep("placement")}
            style={styles.btn}
          />
          {isAndroid && signalSource === "wearable" && (
            <Button
              title="Reconnect stethoscope"
              variant="ghost"
              onPress={async () => {
                await spp.disconnect();
                setStep("connect");
              }}
              style={styles.btn}
            />
          )}
        </View>
      )}

      {/* ── Cough ── */}
      {step === "cough" && (
        <View style={styles.center}>
          <View style={styles.deviceIcon} accessibilityRole="image" accessibilityLabel="Microphone icon">
            <Text style={styles.deviceEmoji} importantForAccessibility="no">🎙</Text>
          </View>
          <Text style={styles.stepHeading}>Cough Recording</Text>
          <Text style={styles.instruction}>
            Ask the patient to cough 3 times into the phone. Press record, then cough.
          </Text>
          <Button
            title="Record Cough (5 seconds)"
            onPress={handleCoughCapture}
            style={styles.btn}
          />
          <Button
            title="Skip — no cough needed"
            onPress={skipCough}
            variant="ghost"
            style={styles.btn}
          />
        </View>
      )}

      {/* ── Analyzing ── */}
      {step === "analyzing" && (
        <View style={styles.center}>
          <View style={styles.analyzeCircle} accessibilityRole="image" accessibilityLabel="Analyzing">
            <Text style={styles.analyzeEmoji} importantForAccessibility="no">&#x23F3;</Text>
          </View>
          <Text style={styles.stepHeading}>Analyzing…</Text>
          <Text style={styles.sub}>Running AI lung sound analysis. Please wait.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F8FD" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 4,
  },
  deviceIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(133, 183, 235, 0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "rgba(24, 95, 165, 0.2)",
  },
  deviceEmoji: { fontSize: 46 },
  stepHeading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#042C53",
    textAlign: "center",
    marginBottom: 8,
  },
  instruction: {
    fontSize: 18,
    color: "#0D2746",
    textAlign: "center",
    lineHeight: 26,
  },
  stepPill: {
    backgroundColor: "#185FA5",
    borderRadius: 9999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 16,
  },
  stepPillText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  zoneTitle: {
    color: "#042C53",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },
  hintBox: {
    backgroundColor: "rgba(133, 183, 235, 0.15)",
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(24, 95, 165, 0.15)",
  },
  btn: { marginBottom: 10, width: "100%" },
  recordCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(216, 90, 48, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "rgba(216, 90, 48, 0.3)",
  },
  recordDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#D85A30",
  },
  recordLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: "#042C53",
    marginBottom: 6,
    textAlign: "center",
  },
  timer: {
    fontSize: 48,
    fontWeight: "800",
    color: "#185FA5",
    marginBottom: 20,
    letterSpacing: -1,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 64,
    gap: 3,
    marginBottom: 16,
    width: "100%",
    justifyContent: "center",
  },
  bar: { width: 4, borderRadius: 2, backgroundColor: "#185FA5" },
  qualityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  qualityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#059669",
  },
  qualityGood: { fontSize: 15, color: "#059669", fontWeight: "600" },
  warnCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(216, 90, 48, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#D85A30",
  },
  warnCircleText: {
    fontSize: 36,
    fontWeight: "800",
    color: "#D85A30",
    lineHeight: 40,
  },
  analyzeCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(24, 95, 165, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  analyzeEmoji: { fontSize: 46 },
  sub: { fontSize: 16, color: "#2D4E73", marginTop: 8, textAlign: "center", lineHeight: 24 },
  errorBox: {
    backgroundColor: "rgba(216, 90, 48, 0.1)",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(216, 90, 48, 0.3)",
  },
  errorText: {
    color: "#D85A30",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "500",
  },
  iosNotice: {
    backgroundColor: "rgba(133, 183, 235, 0.2)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(24, 95, 165, 0.2)",
  },
  iosNoticeText: {
    fontSize: 15,
    color: "#185FA5",
    textAlign: "center",
    lineHeight: 22,
  },
});
