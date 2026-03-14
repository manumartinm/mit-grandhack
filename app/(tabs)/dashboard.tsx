import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { Button, Card, RiskBadge } from "../../src/components";
import { useOutbreak } from "../../src/providers/OutbreakProvider";
import { usePatients } from "../../src/providers/PatientProvider";
import { colors } from "../../src/theme/colors";

export default function DashboardScreen() {
  const router = useRouter();
  const { alerts, getActiveAlerts } = useOutbreak();
  const {
    patients,
    getHighRiskPatients,
    getTodaySessionCount,
    getSessionsForPatient,
    selectPatient,
  } = usePatients();

  const activeAlerts = getActiveAlerts();
  const highRiskPatients = getHighRiskPatients();
  const todayCount = getTodaySessionCount();

  const followUpDue = useMemo(() => {
    return patients.filter((patient) => {
      const latest = getSessionsForPatient(patient.id).find((s) => s.cnnOutput);
      if (!latest?.cnnOutput) return false;
      return latest.cnnOutput.pneumoniaRiskBucket !== "low";
    });
  }, [patients, getSessionsForPatient]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>Today&apos;s screenings</Text>
          <Text style={styles.statValue}>{todayCount}</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>High-risk patients</Text>
          <Text style={styles.statValue}>{highRiskPatients.length}</Text>
        </Card>
      </View>

      <Card variant="risk" riskLevel={activeAlerts.length > 0 ? "high" : "low"}>
        <Text style={styles.sectionTitle}>Outbreak monitoring</Text>
        <Text style={styles.sectionText}>
          {activeAlerts.length > 0
            ? `${activeAlerts.length} active outbreak alert(s) need attention.`
            : "No active outbreak clusters right now."}
        </Text>
        <View style={styles.inlineActions}>
          <Button
            title="Open Outbreak Alerts"
            variant="secondary"
            onPress={() => router.push("/outbreak")}
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Priority follow-up list</Text>
        {followUpDue.length === 0 && (
          <Text style={styles.sectionText}>
            No medium/high-risk follow-ups pending.
          </Text>
        )}
        {followUpDue.slice(0, 8).map((patient) => {
          const latest = getSessionsForPatient(patient.id)[0];
          const risk = latest?.cnnOutput?.pneumoniaRiskBucket;
          return (
            <TouchableOpacity
              key={patient.id}
              style={styles.followUpRow}
              onPress={() => {
                selectPatient(patient.id);
                router.push("/patients/detail");
              }}
            >
              <View style={styles.followLeft}>
                <Text style={styles.followName}>{patient.name}</Text>
                <Text style={styles.followMeta}>
                  {patient.village || "Village N/A"} • Last screening{" "}
                  {latest
                    ? format(new Date(latest.startedAt), "MMM d, h:mm a")
                    : "N/A"}
                </Text>
              </View>
              {risk && <RiskBadge risk={risk} />}
            </TouchableOpacity>
          );
        })}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent outbreak events</Text>
        {alerts.length === 0 && (
          <Text style={styles.sectionText}>
            No outbreak events recorded yet.
          </Text>
        )}
        {alerts.slice(0, 5).map((alert) => (
          <View key={alert.id} style={styles.alertRow}>
            <View style={styles.followLeft}>
              <Text style={styles.followName}>
                {alert.caseCount} cases within {alert.radiusKm}km
              </Text>
              <Text style={styles.followMeta}>
                {format(new Date(alert.detectedAt), "MMM d, h:mm a")}
              </Text>
            </View>
            <Text style={styles.alertStatus}>
              {alert.acknowledged ? "ACK" : "OPEN"}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: 16, paddingBottom: 110, gap: 12 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1 },
  statLabel: { fontSize: 12, color: colors.text.secondary },
  statValue: {
    marginTop: 3,
    fontSize: 28,
    fontWeight: "700",
    color: colors.text.primary,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 6,
  },
  sectionText: { fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
  inlineActions: { marginTop: 10 },
  followUpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(4,44,83,0.08)",
  },
  followLeft: { flex: 1, marginRight: 8 },
  followName: { fontSize: 14, color: colors.text.primary, fontWeight: "600" },
  followMeta: { marginTop: 2, fontSize: 12, color: colors.text.secondary },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(4,44,83,0.08)",
  },
  alertStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.palette.primaryBlue,
    backgroundColor: "rgba(24,95,165,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
