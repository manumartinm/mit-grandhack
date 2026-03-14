import React from "react";
import { View, Text, StyleSheet, Linking } from "react-native";
import { Header, Card, Button } from "../src/components";
import { useDoctorComm } from "../src/providers/DoctorCommProvider";
import { usePatients } from "../src/providers/PatientProvider";
import { colors } from "../src/theme/colors";

export default function DoctorCallScreen() {
  const { selectedPatientId } = usePatients();
  const { activeDoctor, requestCall, callSession, endCall } = useDoctorComm();
  const patientId = selectedPatientId ?? "unknown";

  const callDoctor = async () => {
    if (!activeDoctor) return;
    requestCall(patientId);
    await Linking.openURL(`tel:${activeDoctor.phone}`);
  };

  return (
    <View style={styles.container}>
      <Header
        title="Call Doctor"
        subtitle="Hybrid mode: dialer now, in-app ready later"
        showBack
      />
      <View style={styles.content}>
        <Card variant="elevated" style={styles.card}>
          <Text style={styles.name}>
            {activeDoctor?.name ?? "No doctor assigned"}
          </Text>
          <Text style={styles.meta}>{activeDoctor?.specialty}</Text>
          <Text style={styles.meta}>Phone: {activeDoctor?.phone}</Text>
          <Text style={styles.mode}>Current mode: Dialer fallback</Text>
          <Button
            title="Call now"
            variant="danger"
            onPress={callDoctor}
            style={styles.action}
          />
          {callSession && (
            <Button
              title="Mark call ended"
              variant="secondary"
              onPress={endCall}
            />
          )}
        </Card>

        {callSession && (
          <Card style={styles.session}>
            <Text style={styles.sessionTitle}>Last call request</Text>
            <Text style={styles.sessionText}>Status: {callSession.status}</Text>
            <Text style={styles.sessionText}>
              Created: {new Date(callSession.createdAt).toLocaleString()}
            </Text>
          </Card>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: 16, gap: 12 },
  card: {},
  name: { color: colors.text.primary, fontSize: 20, fontWeight: "700" },
  meta: { color: colors.text.secondary, marginTop: 4, fontSize: 14 },
  mode: { color: colors.palette.urgentCoral, marginTop: 10, fontWeight: "600" },
  action: { marginTop: 12, marginBottom: 8 },
  session: {},
  sessionTitle: {
    color: colors.text.primary,
    fontWeight: "700",
    marginBottom: 6,
  },
  sessionText: { color: colors.text.secondary, fontSize: 13 },
});
