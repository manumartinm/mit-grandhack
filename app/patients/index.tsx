import React, { useMemo, useState } from "react";
import {
  TouchableOpacity,
  Pressable,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { formatDistanceToNowStrict, isToday } from "date-fns";
import { Card, RiskBadge } from "../../src/components";
import { usePatients } from "../../src/providers/PatientProvider";
import { colors } from "../../src/theme/colors";
import type { RiskBucket, Trend } from "../../src/types";

type FilterKey = "all" | "high" | "today" | "followup";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High Risk" },
  { key: "today", label: "Screened Today" },
  { key: "followup", label: "Follow-up Due" },
];

const TREND_LABELS: Record<Trend, string> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
  first_session: "First session",
};

const TREND_ICONS: Record<Trend, string> = {
  improving: "↗",
  stable: "→",
  worsening: "↘",
  first_session: "◉",
};

export default function PatientRosterScreen() {
  const router = useRouter();
  const { patients, getSessionsForPatient, selectPatient } = usePatients();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const patientCards = useMemo(() => {
    return patients.map((patient) => {
      const sessions = getSessionsForPatient(patient.id).filter(
        (s) => s.cnnOutput,
      );
      const latest = sessions[0];
      const latestCnn = latest?.cnnOutput;
      const risk = latestCnn?.pneumoniaRiskBucket;
      const followupDue =
        risk === "high" ||
        risk === "medium" ||
        (!!latest && !isToday(new Date(latest.startedAt)));

      return {
        patient,
        latest,
        risk,
        trend: latestCnn?.trend,
        followupDue,
      };
    });
  }, [patients, getSessionsForPatient]);

  const filtered = useMemo(() => {
    const searched = patientCards.filter(({ patient }) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return (
        patient.name.toLowerCase().includes(query) ||
        patient.village.toLowerCase().includes(query)
      );
    });

    const byFilter = searched.filter(({ latest, risk, followupDue }) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "high") return risk === "high";
      if (activeFilter === "today")
        return !!latest && isToday(new Date(latest.startedAt));
      return followupDue;
    });

    const riskRank: Record<RiskBucket, number> = { high: 0, medium: 1, low: 2 };
    return byFilter.sort((a, b) => {
      const rankA = a.risk ? riskRank[a.risk] : 3;
      const rankB = b.risk ? riskRank[b.risk] : 3;
      if (rankA !== rankB) return rankA - rankB;
      const aTime = a.latest ? new Date(a.latest.startedAt).getTime() : 0;
      const bTime = b.latest ? new Date(b.latest.startedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [patientCards, search, activeFilter]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or village..."
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterWrap}
        contentContainerStyle={styles.filterRow}
      >
        {FILTER_OPTIONS.map((option) => {
          const selected = activeFilter === option.key;
          return (
            <Pressable
              key={option.key}
              style={[styles.filterChip, selected && styles.filterChipActive]}
              onPress={() => setActiveFilter(option.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selected && styles.filterChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list}>
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No patients yet. Add your first patient to begin screening.
            </Text>
          </View>
        )}
        {filtered.map(({ patient, latest, risk, trend }) => {
          const lastSeen = latest
            ? formatDistanceToNowStrict(new Date(latest.startedAt), {
                addSuffix: true,
              })
            : "No screenings yet";

          const topLabel = latest?.cnnOutput
            ? (Object.entries(latest.cnnOutput.classProbabilities).sort(
                ([, a], [, b]) => b - a,
              )[0]?.[0] ?? "Unknown")
            : "Not screened";

          return (
            <Pressable
              key={patient.id}
              onPress={() => {
                selectPatient(patient.id);
                router.push("/patients/detail");
              }}
              style={styles.patientCardTouch}
              accessibilityRole="button"
              accessibilityLabel={`Open patient ${patient.name}, ${patient.age} years old`}
            >
              <Card variant="elevated" style={styles.patientCard}>
                <View style={styles.patientRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {patient.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.patientInfo}>
                    <Text style={styles.patientName}>{patient.name}</Text>
                    <Text style={styles.patientMeta}>
                      {patient.age}y • {patient.sex} •{" "}
                      {patient.village || "Village N/A"}
                    </Text>
                    <Text style={styles.patientSubMeta}>
                      {topLabel} • {lastSeen}
                    </Text>
                    {trend && (
                      <Text style={styles.trendLine}>
                        {TREND_ICONS[trend]} {TREND_LABELS[trend]}
                      </Text>
                    )}
                  </View>
                  {risk && <RiskBadge risk={risk} />}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={styles.floatingAddBtn}
        onPress={() => router.push("/patients/add")}
        accessibilityRole="button"
        accessibilityLabel="Add new patient"
      >
        <Text style={styles.floatingAddIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  searchRow: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  searchInput: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: colors.text.primary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.15)",
  },
  filterWrap: { marginTop: 12, maxHeight: 48 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.2)",
    backgroundColor: "rgba(255,255,255,0.8)",
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: colors.palette.primaryBlue,
    borderColor: "rgba(255,255,255,0.45)",
  },
  filterChipText: {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: "600",
  },
  filterChipTextActive: { color: "#FFFFFF" },
  list: { padding: 16, paddingBottom: 100 },
  patientCardTouch: { marginBottom: 8, minHeight: 72 },
  patientCard: {},
  patientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(24,95,165,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.palette.primaryBlue,
    fontSize: 18,
    fontWeight: "700",
  },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: "700", color: colors.text.primary },
  patientMeta: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  patientSubMeta: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
  trendLine: { fontSize: 12, color: colors.palette.primaryBlue, marginTop: 2 },
  empty: { paddingTop: 60, alignItems: "center" },
  emptyText: {
    color: colors.text.secondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  floatingAddBtn: {
    position: "absolute",
    right: 18,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.palette.primaryBlue,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#001834",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  floatingAddIcon: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "700",
    marginTop: -2,
  },
});
