import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { usePatients } from "../../src/providers/PatientProvider";
import { useDoctorComm } from "../../src/providers/DoctorCommProvider";
import { Button, Card, GlassSurface } from "../../src/components";
import { colors } from "../../src/theme/colors";

export default function DoctorChatScreen() {
  const router = useRouter();
  const { selectedPatientId } = usePatients();
  const { doctors, activeDoctor, selectDoctor } = useDoctorComm();
  const patientId = selectedPatientId ?? "unknown";

  const activeLabel = useMemo(
    () =>
      activeDoctor
        ? `${activeDoctor.name} • ${activeDoctor.specialty}`
        : "No doctor selected",
    [activeDoctor],
  );

  return (
    <View style={styles.container}>
      <GlassSurface style={styles.activeDoctorCard}>
        <Text style={styles.activeDoctorTitle}>Active doctor</Text>
        <Text style={styles.activeDoctorValue}>{activeLabel}</Text>
      </GlassSurface>

      <ScrollView
        horizontal
        style={styles.doctorScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.doctorRow}
      >
        {doctors.map((doctor) => (
          <TouchableOpacity
            key={doctor.id}
            onPress={() => selectDoctor(doctor.id)}
            style={[
              styles.docChip,
              doctor.id === activeDoctor?.id && styles.docChipActive,
            ]}
            accessibilityRole="radio"
            accessibilityLabel={`Select doctor ${doctor.name}`}
            accessibilityState={{ selected: doctor.id === activeDoctor?.id }}
          >
            <Text
              style={[
                styles.docChipText,
                doctor.id === activeDoctor?.id && styles.docChipTextActive,
              ]}
            >
              {doctor.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.profileWrap}
        contentContainerStyle={styles.profileContent}
      >
        <Card style={styles.profileCard}>
          <Text style={styles.name}>
            {activeDoctor?.name ?? "Doctor unavailable"}
          </Text>
          <Text style={styles.meta}>{activeDoctor?.specialty ?? "-"}</Text>
          <Text style={styles.meta}>Contact: {activeDoctor?.phone ?? "-"}</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: activeDoctor?.online ? "#22C55E" : "#F59E0B",
                },
              ]}
            />
            <Text style={styles.statusText}>
              {activeDoctor?.online ? "Online now" : "Offline - call available"}
            </Text>
          </View>
          <Text style={styles.patientText}>Patient context: {patientId}</Text>
        </Card>

        <View style={styles.actions}>
          <Button
            title="Call Doctor"
            variant="danger"
            onPress={() => router.push("/doctor-call")}
          />
          <Button
            title="View Full Contact"
            variant="secondary"
            onPress={() => router.push("/doctor-call")}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  activeDoctorCard: { marginHorizontal: 16, marginTop: 8, marginBottom: 10 },
  activeDoctorTitle: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  activeDoctorValue: {
    marginTop: 4,
    color: colors.text.primary,
    fontWeight: "700",
  },
  doctorScroll: { maxHeight: 56 },
  doctorRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
    alignItems: "center",
  },
  docChip: {
    backgroundColor: "rgba(255,255,255,0.64)",
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 999,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  docChipActive: {
    backgroundColor: colors.palette.primaryBlue,
    borderColor: "rgba(255,255,255,0.45)",
  },
  docChipText: { color: colors.text.primary, fontSize: 12, fontWeight: "600" },
  docChipTextActive: { color: "#FFFFFF" },
  profileWrap: { flex: 1 },
  profileContent: { padding: 16, gap: 12, paddingBottom: 110 },
  profileCard: {},
  name: { color: colors.text.primary, fontSize: 20, fontWeight: "700" },
  meta: { color: colors.text.secondary, marginTop: 4, fontSize: 14 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  statusDot: { width: 9, height: 9, borderRadius: 4.5 },
  statusText: { color: colors.text.primary, fontSize: 13, fontWeight: "600" },
  patientText: { marginTop: 12, color: colors.text.muted, fontSize: 12 },
  actions: { gap: 10 },
});
