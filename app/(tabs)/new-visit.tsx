import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, RiskBadge } from "../../src/components";
import { usePatients } from "../../src/providers/PatientProvider";
import { colors } from "../../src/theme/colors";

export default function NewVisitScreen() {
  const router = useRouter();
  const { patients, getSessionsForPatient, selectPatient } = usePatients();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const patientCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return patients
      .filter((patient) => {
        if (!query) return true;
        return (
          patient.name.toLowerCase().includes(query) ||
          patient.village.toLowerCase().includes(query)
        );
      })
      .map((patient) => {
        const latest = getSessionsForPatient(patient.id).find(
          (s) => s.cnnOutput,
        );
        return { patient, latestRisk: latest?.cnnOutput?.pneumoniaRiskBucket };
      });
  }, [patients, getSessionsForPatient, search]);

  return (
    <View style={styles.container}>
      <View style={styles.headerPanel}>
        <Text style={styles.title}>Start New Visit</Text>
        <Text style={styles.subtitle}>
          Select the patient first, then begin guided lung screening.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient by name or village"
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {patientCards.length === 0 && (
          <Card>
            <Text style={styles.emptyText}>
              No matching patients. Add a new patient before starting the visit.
            </Text>
          </Card>
        )}

        {patientCards.map(({ patient, latestRisk }) => {
          const selected = selectedId === patient.id;
          return (
            <Pressable
              key={patient.id}
              onPress={() => setSelectedId(patient.id)}
              style={[styles.patientCard, selected && styles.patientCardActive]}
            >
              <View style={styles.patientRow}>
                <View style={styles.nameWrap}>
                  <Text style={styles.patientName}>{patient.name}</Text>
                  <Text style={styles.patientMeta}>
                    {patient.age}y • {patient.sex} •{" "}
                    {patient.village || "Village N/A"}
                  </Text>
                </View>
                {latestRisk && <RiskBadge risk={latestRisk} />}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Start Screening"
          disabled={!selectedId}
          onPress={() => {
            if (!selectedId) return;
            selectPatient(selectedId);
            router.push("/screening");
          }}
        />
        <Button
          title="Add New Patient"
          variant="secondary"
          onPress={() => router.push("/patients/add")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  headerPanel: {
    marginTop: 10,
    marginHorizontal: 16,
    backgroundColor: "rgba(4,44,83,0.82)",
    borderRadius: 16,
    padding: 16,
  },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 18,
  },
  searchRow: { paddingHorizontal: 16, marginTop: 12 },
  searchInput: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.15)",
    color: colors.text.primary,
  },
  list: { padding: 16, paddingBottom: 120, gap: 8 },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 20,
  },
  patientCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.12)",
    backgroundColor: "rgba(255,255,255,0.82)",
    padding: 14,
  },
  patientCardActive: {
    borderColor: colors.palette.primaryBlue,
    backgroundColor: "rgba(24,95,165,0.08)",
  },
  patientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  nameWrap: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: "700", color: colors.text.primary },
  patientMeta: { marginTop: 2, fontSize: 12, color: colors.text.secondary },
  footer: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 90,
    gap: 8,
  },
});
