import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Polygon,
  Polyline,
  Text as SvgText,
  Line,
} from "react-native-svg";
import { useRouter } from "expo-router";
import { Header, Button, Card, RiskBadge } from "../../src/components";
import { useAuth } from "../../src/providers/AuthProvider";
import { usePatients } from "../../src/providers/PatientProvider";
import {
  generateScreeningInsights,
  type ScreeningTriageInsight,
} from "../../src/services/openaiService";
import { colors } from "../../src/theme/colors";
import type {
  CNNOutputTool,
  ZoneRecordingResult,
  ScreeningSession,
} from "../../src/types";

type ResultTab = "summary" | "technical";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFallbackTriage(
  pneumoniaRiskBucket: "low" | "medium" | "high",
  topLabel: string,
  topProb: number,
  confidence: number,
  escalationReason?: string,
): ScreeningTriageInsight {
  const referral = pneumoniaRiskBucket !== "low";
  const isHealthy = topLabel === "Healthy";
  return {
    verdict:
      isHealthy
        ? "No significant respiratory pattern detected"
        : pneumoniaRiskBucket === "high"
          ? `High-risk pattern — ${topLabel} most likely`
          : pneumoniaRiskBucket === "medium"
            ? `Moderate-risk pattern — ${topLabel} most likely`
            : `Low-risk pattern — ${topLabel} most likely`,
    explanation: `Model detected ${topLabel} as the most likely condition (${(topProb * 100).toFixed(1)}%) with ${(confidence * 100).toFixed(0)}% confidence. Use clinical assessment and follow-up to confirm.`,
    warningSigns: [
      "Fast breathing, chest indrawing, or audible distress",
      "Persistent high fever or worsening cough",
      "Lethargy or inability to drink/eat normally",
    ],
    nextActions: [
      "Record this result and current symptoms in patient notes",
      "Repeat screening if quality is poor or condition changes",
      referral
        ? "Escalate to doctor with referral summary"
        : "Continue local monitoring and recheck soon",
    ],
    recommendReferral: referral || !!escalationReason,
  };
}

// ─── Chart sub-components ────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  Pneumonia:     colors.palette.urgentCoral,
  COPD:          "#C05010",
  Bronchiectasis: colors.palette.softCoral,
  Bronchiolitis: "#D97706",
  URTI:          colors.palette.primaryBlue,
  Healthy:       "#059669",
};

// Fixed axis order — Pneumonia at top, then clockwise
const RADAR_CLASSES = ["Pneumonia", "COPD", "Bronchiectasis", "Bronchiolitis", "URTI", "Healthy"];
const GRID_LEVELS   = [0.25, 0.5, 0.75, 1.0];

function RadarChart({ probs, size }: { probs: Record<string, number>; size: number }) {
  const N   = RADAR_CLASSES.length;
  const CX  = size / 2;
  const CY  = size / 2;
  const R   = size * 0.30;          // data radius
  const LR  = R + size * 0.16;      // label ring radius

  const axisAngle = (i: number) => (2 * Math.PI * i) / N - Math.PI / 2;

  const polarPt = (i: number, r: number) => ({
    x: CX + r * Math.cos(axisAngle(i)),
    y: CY + r * Math.sin(axisAngle(i)),
  });

  // Determine fill colour from the dominant class
  const topClass  = RADAR_CLASSES.reduce((best, cls) =>
    (probs[cls] ?? 0) > (probs[best] ?? 0) ? cls : best, RADAR_CLASSES[0]);
  const fillColor = CLASS_COLORS[topClass] ?? colors.palette.primaryBlue;

  // Polygon strings
  const gridPolygon = (level: number) =>
    RADAR_CLASSES.map((_, i) => {
      const p = polarPt(i, level * R);
      return `${p.x},${p.y}`;
    }).join(" ");

  const dataPolygon = RADAR_CLASSES.map((cls, i) => {
    const p = polarPt(i, (probs[cls] ?? 0) * R);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        {/* ── Grid rings ───────────────────────────────────────────── */}
        {GRID_LEVELS.map((level) => (
          <Polygon
            key={level}
            points={gridPolygon(level)}
            fill="none"
            stroke={level === 1.0 ? "#CBD5E1" : "#E9EEF4"}
            strokeWidth={level === 1.0 ? 1.5 : 1}
          />
        ))}

        {/* ── Axis spokes ──────────────────────────────────────────── */}
        {RADAR_CLASSES.map((_, i) => {
          const end = polarPt(i, R);
          return (
            <Line
              key={i}
              x1={CX} y1={CY}
              x2={end.x} y2={end.y}
              stroke="#DDE4ED"
              strokeWidth="1"
            />
          );
        })}

        {/* ── Data area ────────────────────────────────────────────── */}
        <Polygon
          points={dataPolygon}
          fill={fillColor + "28"}
          stroke={fillColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* ── Data point dots ──────────────────────────────────────── */}
        {RADAR_CLASSES.map((cls, i) => {
          const p = polarPt(i, (probs[cls] ?? 0) * R);
          return (
            <Circle
              key={cls}
              cx={p.x} cy={p.y}
              r="5"
              fill={CLASS_COLORS[cls] ?? fillColor}
              stroke="#fff"
              strokeWidth="1.5"
            />
          );
        })}

        {/* ── Axis labels ──────────────────────────────────────────── */}
        {RADAR_CLASSES.map((cls, i) => {
          const lp   = polarPt(i, LR);
          const anchor =
            lp.x < CX - 8 ? "end" : lp.x > CX + 8 ? "start" : "middle";
          const pct  = Math.round((probs[cls] ?? 0) * 100);
          const col  = CLASS_COLORS[cls] ?? fillColor;
          return (
            <React.Fragment key={cls}>
              <SvgText
                x={lp.x} y={lp.y - 6}
                textAnchor={anchor}
                fill="#374151"
                fontSize="10"
                fontWeight="600"
              >
                {cls}
              </SvgText>
              <SvgText
                x={lp.x} y={lp.y + 7}
                textAnchor={anchor}
                fill={col}
                fontSize="11"
                fontWeight="700"
              >
                {pct}%
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* ── Centre dot ───────────────────────────────────────────── */}
        <Circle cx={CX} cy={CY} r="3" fill="#CBD5E1" />
      </Svg>

      {/* ── Legend row ───────────────────────────────────────────── */}
      <View style={chart.radarLegend}>
        {RADAR_CLASSES.map((cls) => (
          <View key={cls} style={chart.radarLegendItem}>
            <View style={[chart.radarLegendDot, { backgroundColor: CLASS_COLORS[cls] }]} />
            <Text style={chart.radarLegendText}>{cls}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const ZONE_LABEL: Record<string, string> = {
  left_upper_front: "Left Upper",
  right_upper_front: "Right Upper",
  left_lower_back: "Left Lower",
  right_lower_back: "Right Lower",
};

function TrendSparkline({
  sessions,
  width,
}: {
  sessions: ScreeningSession[];
  width: number;
}) {
  const pts = sessions
    .filter((s) => s.cnnOutput)
    .slice(0, 8)
    .reverse()
    .map((s) => s.cnnOutput!.classProbabilities["Pneumonia"] ?? 0);

  if (pts.length < 2) return null;

  const W = width;
  const H = 72;
  const PAD_X = 14;
  const PAD_Y = 10;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;
  const xStep = chartW / (pts.length - 1);

  const coords = pts.map((v, i) => ({
    x: PAD_X + i * xStep,
    y: PAD_Y + (1 - Math.min(v, 1)) * chartH,
  }));

  // Reference threshold lines (30% = medium, 60% = high)
  const yMed = PAD_Y + (1 - 0.3) * chartH;
  const yHigh = PAD_Y + (1 - 0.6) * chartH;

  const polyPoints = coords.map((p) => `${p.x},${p.y}`).join(" ");

  const dotColor = (v: number) =>
    v >= 0.6 ? colors.palette.urgentCoral : v >= 0.3 ? colors.palette.softCoral : "#059669";

  return (
    <View>
      <Text style={chart.trendLabel}>
        Pneumonia risk — last {pts.length} sessions
      </Text>
      <Svg width={W} height={H}>
        {/* Threshold reference lines */}
        <Line
          x1={PAD_X}
          y1={yHigh}
          x2={W - PAD_X}
          y2={yHigh}
          stroke="#DC262622"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <Line
          x1={PAD_X}
          y1={yMed}
          x2={W - PAD_X}
          y2={yMed}
          stroke="#D9770622"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <SvgText x={W - PAD_X + 2} y={yHigh + 4} fontSize="8" fill="#DC2626">
          Hi
        </SvgText>
        <SvgText x={W - PAD_X + 2} y={yMed + 4} fontSize="8" fill="#D97706">
          Md
        </SvgText>

        {/* Trend line */}
        <Polyline
          points={polyPoints}
          fill="none"
          stroke="#185FA5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data point dots */}
        {coords.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill={dotColor(pts[i])}
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}
      </Svg>
    </View>
  );
}


// ─── Technical tab content ────────────────────────────────────────────────────

function TechnicalTab({
  cnn,
  preprocessWarnings,
  zoneResults,
  sessions,
  riskColor,
}: {
  cnn: CNNOutputTool;
  preprocessWarnings: string[];
  zoneResults?: ZoneRecordingResult[];
  sessions: ScreeningSession[];
  riskColor: string;
}) {
  const { width } = useWindowDimensions();
  const cardInnerW = width - 32 - 32;

  const sorted = Object.entries(cnn.classProbabilities).sort(([, a], [, b]) => b - a);
  const [topLabel, topProb] = sorted[0] ?? ["Unknown", 0];

  const qualityPct = Math.round((cnn.signalQuality?.qualityScore ?? 0) * 100);
  const qualityLabel = qualityPct >= 70 ? "Good" : qualityPct >= 50 ? "Fair" : "Poor";
  const qualityColor = qualityPct >= 70 ? "#059669" : qualityPct >= 50 ? colors.palette.softCoral : colors.palette.urgentCoral;

  return (
    <ScrollView contentContainerStyle={tab.scrollContent}>
      {/* ── Top detected condition ── */}
      <Card style={tab.section}>
        <Text style={tab.sectionTitle}>Detected condition</Text>
        <View style={tab.conditionRow}>
          <Text style={tab.conditionLabel}>{topLabel}</Text>
          <Text style={tab.conditionPct}>{(topProb * 100).toFixed(0)}%</Text>
        </View>
        <View style={tab.metaRow}>
          <View style={tab.metaItem}>
            <Text style={tab.metaValue}>{(cnn.confidence * 100).toFixed(0)}%</Text>
            <Text style={tab.metaLabel}>Confidence</Text>
          </View>
          <View style={tab.metaDivider} />
          <View style={tab.metaItem}>
            <Text style={tab.metaValue}>{cnn.trend.replace("_", " ")}</Text>
            <Text style={tab.metaLabel}>Trend</Text>
          </View>
          <View style={tab.metaDivider} />
          <View style={tab.metaItem}>
            <Text style={tab.metaValue}>{cnn.signalSource.replace(/_/g, " ")}</Text>
            <Text style={tab.metaLabel}>Source</Text>
          </View>
        </View>
      </Card>

      {/* ── Audio quality ── */}
      <Card style={tab.section}>
        <Text style={tab.sectionTitle}>Recording quality</Text>
        <View style={tab.qualityBadgeRow}>
          <View style={[tab.qualityBadge, { backgroundColor: qualityColor + "18", borderColor: qualityColor + "40" }]}>
            <Text style={[tab.qualityBadgeText, { color: qualityColor }]}>{qualityLabel} — {qualityPct}%</Text>
          </View>
        </View>
        <View style={tab.metaRow}>
          <View style={tab.metaItem}>
            <Text style={tab.metaValue}>{(cnn.signalQuality?.noiseFloorDb ?? 0).toFixed(0)} dB</Text>
            <Text style={tab.metaLabel}>Noise floor</Text>
          </View>
          <View style={tab.metaDivider} />
          <View style={tab.metaItem}>
            <Text style={tab.metaValue}>{((cnn.signalQuality?.clippingRatio ?? 0) * 100).toFixed(1)}%</Text>
            <Text style={tab.metaLabel}>Clipping</Text>
          </View>
          <View style={tab.metaDivider} />
          <View style={tab.metaItem}>
            <Text style={tab.metaValue}>{(cnn.signalQuality?.durationSec ?? 0).toFixed(1)}s</Text>
            <Text style={tab.metaLabel}>Duration</Text>
          </View>
        </View>

        {/* Zone quality — simple list */}
        {zoneResults && zoneResults.length > 0 && (
          <>
            <Text style={tab.subSectionTitle}>Quality per zone</Text>
            {zoneResults.map((z) => {
              const pct = Math.round(z.qualityScore * 100);
              const col = pct >= 70 ? "#059669" : pct >= 50 ? colors.palette.softCoral : colors.palette.urgentCoral;
              return (
                <View key={z.zone} style={tab.zoneRow}>
                  <Text style={tab.zoneName}>{ZONE_LABEL[z.zone] ?? z.zone}</Text>
                  <View style={tab.zoneRight}>
                    <Text style={[tab.zonePct, { color: col }]}>{pct}%</Text>
                    <Text style={[tab.zoneStatus, { color: col }]}>{z.passed ? "Pass" : "Fail"}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {preprocessWarnings.length > 0 && (
          <View style={tab.warnBox}>
            {preprocessWarnings.map((w) => (
              <Text key={w} style={tab.warnText}>⚠ {w}</Text>
            ))}
          </View>
        )}
      </Card>

      {/* ── Condition breakdown chart ── */}
      <Card style={tab.section}>
        <Text style={tab.sectionTitle}>Condition breakdown</Text>
        <Text style={tab.chartNote}>Probability of each condition detected by the AI model</Text>
        <RadarChart probs={cnn.classProbabilities} size={cardInnerW} />
      </Card>

      {/* ── Risk trend ── */}
      {sessions.filter((s) => s.cnnOutput).length > 1 && (
        <Card style={tab.section}>
          <Text style={tab.sectionTitle}>Risk over time</Text>
          <TrendSparkline sessions={sessions} width={cardInnerW} />
        </Card>
      )}

    </ScrollView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const router = useRouter();
  const { selectedPatientId, patients, getSessionsForPatient } = usePatients();
  const { token, isAuthenticated } = useAuth();
  const patient = patients.find((p) => p.id === selectedPatientId);
  const patientSessions = selectedPatientId
    ? getSessionsForPatient(selectedPatientId)
    : [];
  const latestSession = patientSessions[0];
  const cnn = latestSession?.cnnOutput;
  const allRecordings = patientSessions.filter((s) => s.cnnOutput);

  const preprocessWarnings: string[] = (() => {
    try {
      const notes = JSON.parse(latestSession?.notes ?? "{}");
      return Array.isArray(notes?.preprocessWarnings)
        ? notes.preprocessWarnings
        : [];
    } catch {
      return [];
    }
  })();

  const [triage, setTriage] = useState<ScreeningTriageInsight | null>(null);
  const [loadingTriage, setLoadingTriage] = useState(false);
  const [decision, setDecision] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("summary");

  React.useEffect(() => {
    if (!cnn) return;
    const topEntry = Object.entries(cnn.classProbabilities).sort(([, a], [, b]) => b - a)[0] ?? ["Unknown", 0];
    const fallback = buildFallbackTriage(
      cnn.pneumoniaRiskBucket,
      topEntry[0],
      topEntry[1],
      cnn.confidence,
      cnn.guardrails.escalationReason,
    );

    if (!token || !isAuthenticated) {
      setTriage(fallback);
      return;
    }

    setLoadingTriage(true);
    generateScreeningInsights(token, cnn, patient ?? null, patientSessions)
      .then(setTriage)
      .catch(() => setTriage(fallback))
      .finally(() => setLoadingTriage(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestSession?.id, selectedPatientId, token, isAuthenticated]);

  const riskColor = useMemo(
    () =>
      cnn?.pneumoniaRiskBucket === "high"
        ? colors.palette.urgentCoral
        : cnn?.pneumoniaRiskBucket === "medium"
          ? "#C05010"
          : colors.palette.primaryBlue,
    [cnn?.pneumoniaRiskBucket],
  );

  const riskBg = useMemo(
    () =>
      cnn?.pneumoniaRiskBucket === "high"
        ? "rgba(216,90,48,0.08)"
        : cnn?.pneumoniaRiskBucket === "medium"
          ? "rgba(240,153,123,0.1)"
          : "rgba(133,183,235,0.15)",
    [cnn?.pneumoniaRiskBucket],
  );

  const riskBorder = useMemo(
    () =>
      cnn?.pneumoniaRiskBucket === "high"
        ? "rgba(216,90,48,0.35)"
        : cnn?.pneumoniaRiskBucket === "medium"
          ? "rgba(240,153,123,0.35)"
          : "rgba(24,95,165,0.25)",
    [cnn?.pneumoniaRiskBucket],
  );

  const riskLabel = useMemo(
    () =>
      cnn?.pneumoniaRiskBucket === "high"
        ? "HIGH RISK"
        : cnn?.pneumoniaRiskBucket === "medium"
          ? "MEDIUM RISK"
          : "LOW RISK",
    [cnn?.pneumoniaRiskBucket],
  );

  if (!cnn) {
    return (
      <View style={styles.container}>
        <Header title="Screening Results" subtitle={patient?.name} showBack />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No screening result available.</Text>
          <Button title="Back to Patients" onPress={() => router.replace("/home")} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Screening Results" subtitle={patient?.name} showBack />

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "summary" && styles.tabActive]}
          onPress={() => setActiveTab("summary")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "summary" }}
          accessibilityLabel="Summary tab"
        >
          <Text style={[styles.tabText, activeTab === "summary" && styles.tabTextActive]}>
            Summary
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "technical" && styles.tabActive]}
          onPress={() => setActiveTab("technical")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "technical" }}
          accessibilityLabel="Technical details tab"
        >
          <Text style={[styles.tabText, activeTab === "technical" && styles.tabTextActive]}>
            Technical
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Summary tab ── */}
      {activeTab === "summary" && (
        <ScrollView contentContainerStyle={styles.content}>

          {/* Hero risk banner */}
          <View
            style={[styles.riskBanner, { backgroundColor: riskBg, borderColor: riskBorder }]}
            accessibilityRole="header"
            accessibilityLabel={`Risk level: ${riskLabel}`}
          >
            <View style={styles.riskLabelRow}>
              <View style={[styles.riskLabelPill, { backgroundColor: riskColor }]}>
                <Text style={styles.riskLabelText}>{riskLabel}</Text>
              </View>
              {loadingTriage && <Text style={styles.loadingText}>Updating…</Text>}
            </View>
            <Text style={[styles.triageHeading, { color: riskColor }]}>
              {triage?.verdict ?? "Analyzing results…"}
            </Text>
            <Text style={styles.triageExplanation}>
              {triage?.explanation ?? "Analyzing latest screening and generating guidance..."}
            </Text>
          </View>

          {/* Warning signs */}
          {triage && triage.warningSigns.length > 0 && (
            <Card style={styles.warnCard}>
              <Text style={styles.sectionTitle}>Watch for these signs</Text>
              {triage.warningSigns.map((line) => (
                <View key={line} style={styles.bulletRow}>
                  <Text style={styles.bulletMark}>•</Text>
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </Card>
          )}

          {/* Suggested actions */}
          {triage && triage.nextActions.length > 0 && (
            <Card style={styles.actionsCard}>
              <Text style={styles.sectionTitle}>Suggested actions</Text>
              {triage.nextActions.map((line) => (
                <View key={line} style={styles.bulletRow}>
                  <Text style={[styles.bulletMark, { color: colors.palette.primaryBlue }]}>✓</Text>
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </Card>
          )}

          {/* ── Next Steps ── */}
          <View style={styles.nextStepsWrap}>
            <Text style={styles.nextStepsHeading}>What would you like to do?</Text>

            {cnn.pneumoniaRiskBucket !== "low" ? (
              /* High / Medium risk — two options stacked prominently */
              <>
                <Pressable
                  style={[styles.stepCard, styles.stepCardRefer]}
                  onPress={() => {
                    setDecision("Referred to doctor");
                    router.push("/telemedicine");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Refer to doctor"
                >
                  <View style={styles.stepCardIconWrap}>
                    <Text style={styles.stepCardIcon}>🩺</Text>
                  </View>
                  <View style={styles.stepCardText}>
                    <Text style={styles.stepCardTitle}>Refer to Doctor</Text>
                    <Text style={styles.stepCardSub}>Connect with a physician now via telemedicine</Text>
                  </View>
                  <Text style={styles.stepCardArrow}>›</Text>
                </Pressable>

                <Pressable
                  style={[styles.stepCard, styles.stepCardLocal]}
                  onPress={() => {
                    setDecision("Managed locally by nurse");
                    Alert.alert(
                      "Treatment documented",
                      "Continue monitoring symptoms and schedule a follow-up screening.",
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Manage locally"
                >
                  <View style={styles.stepCardIconWrap}>
                    <Text style={styles.stepCardIcon}>📋</Text>
                  </View>
                  <View style={styles.stepCardText}>
                    <Text style={[styles.stepCardTitle, { color: colors.text.primary }]}>Manage Locally</Text>
                    <Text style={[styles.stepCardSub, { color: colors.text.secondary }]}>Monitor and schedule follow-up</Text>
                  </View>
                  <Text style={[styles.stepCardArrow, { color: colors.border.default }]}>›</Text>
                </Pressable>
              </>
            ) : (
              /* Low risk — manage locally is primary */
              <Pressable
                style={[styles.stepCard, styles.stepCardLocalPrimary]}
                onPress={() => {
                  setDecision("Managed locally by nurse");
                  Alert.alert(
                    "Treatment documented",
                    "Continue monitoring symptoms and schedule a follow-up screening.",
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Manage locally"
              >
                <View style={styles.stepCardIconWrap}>
                  <Text style={styles.stepCardIcon}>✅</Text>
                </View>
                <View style={styles.stepCardText}>
                  <Text style={[styles.stepCardTitle, { color: colors.text.primary }]}>Manage Locally</Text>
                  <Text style={[styles.stepCardSub, { color: colors.text.secondary }]}>Monitor and schedule follow-up</Text>
                </View>
                <Text style={[styles.stepCardArrow, { color: colors.border.default }]}>›</Text>
              </Pressable>
            )}

            {/* Secondary row: Repeat + Done */}
            <View style={styles.stepSecondaryRow}>
              <TouchableOpacity
                style={styles.repeatChip}
                onPress={() => router.replace("/screening")}
                accessibilityRole="button"
                accessibilityLabel="Repeat screening"
              >
                <Text style={styles.repeatChipIcon}>↻</Text>
                <Text style={styles.repeatChipText}>Repeat Screening</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.doneChip}
                onPress={() => router.replace("/home")}
                accessibilityRole="button"
                accessibilityLabel="Done, go home"
              >
                <Text style={styles.doneChipText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Decision logged */}
          {decision && (
            <Card style={styles.decisionCard}>
              <Text style={styles.decisionLabel}>Decision logged</Text>
              <Text style={styles.decisionValue}>{decision}</Text>
            </Card>
          )}

          {/* Past screenings */}
          {allRecordings.length > 1 && (
            <Card>
              <Text style={styles.historyTitle}>Previous screenings</Text>
              {allRecordings.slice(0, 6).map((session) => (
                <View key={session.id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>
                    {new Date(session.startedAt).toLocaleDateString(undefined, {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </Text>
                  {session.cnnOutput && (
                    <RiskBadge risk={session.cnnOutput.pneumoniaRiskBucket} />
                  )}
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      )}

      {/* ── Technical tab ── */}
      {activeTab === "technical" && (
        <TechnicalTab
          cnn={cnn}
          preprocessWarnings={preprocessWarnings}
          zoneResults={latestSession?.zoneResults}
          sessions={allRecordings}
          riskColor={riskColor}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  emptyWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20, gap: 14 },
  emptyText: { textAlign: "center", color: colors.text.secondary, fontSize: 17, lineHeight: 24 },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(4,44,83,0.1)",
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.palette.primaryBlue },
  tabText: { fontSize: 16, fontWeight: "600", color: colors.text.muted },
  tabTextActive: { color: colors.palette.primaryBlue },

  // Hero risk banner
  riskBanner: { borderRadius: 18, borderWidth: 1.5, padding: 20, gap: 10 },
  riskLabelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  riskLabelPill: { borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 7 },
  riskLabelText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  triageHeading: { fontSize: 20, fontWeight: "800", lineHeight: 28 },
  triageExplanation: { color: colors.text.primary, lineHeight: 24, fontSize: 16 },
  loadingText: { color: colors.palette.primaryBlue, fontSize: 13, fontWeight: "500" },

  // Warning and action cards
  warnCard: { borderLeftWidth: 4, borderLeftColor: colors.palette.urgentCoral, gap: 10 },
  actionsCard: { borderLeftWidth: 4, borderLeftColor: colors.palette.primaryBlue, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text.primary, marginBottom: 4 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 2 },
  bulletMark: {
    fontSize: 18,
    color: colors.palette.urgentCoral,
    fontWeight: "700",
    lineHeight: 26,
    width: 20,
    flexShrink: 0,
  },
  bulletText: { flex: 1, color: colors.text.primary, fontSize: 16, lineHeight: 26 },

  // Next Steps section
  nextStepsWrap: {
    backgroundColor: "#F0F4FA",
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  nextStepsHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },

  // Step cards
  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 12,
  },
  stepCardRefer: {
    backgroundColor: colors.palette.urgentCoral,
  },
  stepCardLocal: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  stepCardLocalPrimary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  stepCardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCardIcon: { fontSize: 20 },
  stepCardText: { flex: 1, gap: 2 },
  stepCardTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  stepCardSub: { fontSize: 13, color: "rgba(255,255,255,0.82)", fontWeight: "400" },
  stepCardArrow: { fontSize: 24, fontWeight: "300", color: "#FFFFFF", lineHeight: 28 },

  // Secondary row (Repeat + Done)
  stepSecondaryRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  repeatChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingVertical: 11,
  },
  repeatChipIcon: {
    fontSize: 16,
    color: colors.palette.primaryBlue,
    fontWeight: "600",
  },
  repeatChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.palette.primaryBlue,
  },
  doneChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.palette.primaryBlue,
    borderRadius: 12,
    paddingVertical: 11,
  },
  doneChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Legacy kept for compat
  actionGrid: { gap: 10 },
  actionBtn: { borderRadius: 16, padding: 18, gap: 4 },
  actionBtnDanger: { backgroundColor: colors.palette.urgentCoral },
  actionBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  actionBtnLabel: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  actionBtnSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: "500" },

  // Decision
  decisionCard: { borderWidth: 1, borderColor: "rgba(4,44,83,0.1)" },
  decisionLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  decisionValue: { fontSize: 17, color: colors.text.primary, marginTop: 4, fontWeight: "600" },

  // History
  historyTitle: { fontSize: 16, fontWeight: "700", color: colors.text.primary, marginBottom: 10 },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(4,44,83,0.08)",
  },
  historyDate: { color: colors.text.secondary, fontSize: 15, fontWeight: "500" },
});

// ─── Technical tab styles ─────────────────────────────────────────────────────

const tab = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 40, gap: 14 },
  section: { gap: 0 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  chartNote: { fontSize: 14, color: colors.text.muted, marginBottom: 12, lineHeight: 20 },

  // Detected condition
  conditionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  conditionLabel: { fontSize: 22, fontWeight: "800", color: colors.text.primary },
  conditionPct: { fontSize: 28, fontWeight: "800", color: colors.palette.primaryBlue },

  // Meta row (confidence / trend / source)
  metaRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(4,44,83,0.08)",
    paddingTop: 12,
  },
  metaItem: { flex: 1, alignItems: "center", gap: 3 },
  metaValue: { fontSize: 15, fontWeight: "700", color: colors.text.primary, textAlign: "center" },
  metaLabel: { fontSize: 12, color: colors.text.muted, textAlign: "center" },
  metaDivider: { width: 1, backgroundColor: "rgba(4,44,83,0.1)", marginVertical: 2 },

  // Quality badge
  qualityBadgeRow: { marginBottom: 14 },
  qualityBadge: {
    alignSelf: "flex-start",
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  qualityBadgeText: { fontSize: 14, fontWeight: "700" },

  // Zone rows (list style, not grid)
  zoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(4,44,83,0.06)",
  },
  zoneName: { fontSize: 15, color: colors.text.primary, fontWeight: "500" },
  zoneRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  zonePct: { fontSize: 15, fontWeight: "700" },
  zoneStatus: { fontSize: 13, fontWeight: "600" },

  // Warnings
  warnBox: {
    marginTop: 12,
    backgroundColor: "rgba(240,153,123,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(216,90,48,0.2)",
    padding: 12,
    gap: 6,
  },
  warnText: { fontSize: 14, color: "#92400E", lineHeight: 20 },

});

// ─── Retained chart styles (used by RadarChart, TrendSparkline) ──────────────

const chart = StyleSheet.create({
  radarLegend: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "center",
    gap: 10, marginTop: 4, marginBottom: 4,
  },
  radarLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  radarLegendDot: { width: 8, height: 8, borderRadius: 4 },
  radarLegendText: { fontSize: 11, color: colors.text.secondary, fontWeight: "500" },
  trendLabel: { fontSize: 13, color: colors.text.muted, marginBottom: 6, fontWeight: "500" },
});
