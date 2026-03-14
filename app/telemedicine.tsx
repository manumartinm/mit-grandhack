import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header, Card, Button } from "../src/components";
import { usePatients } from "../src/providers/PatientProvider";
import { referralService } from "../src/features/telemedicine/referralService";

export default function TelemedicineScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [referralId, setReferralId] = useState("");

  const {
    selectedPatientId,
    patients,
    getSessionsForPatient,
    updateSession,
    getRecentSoundRecords,
  } = usePatients();
  const patient = patients.find((p) => p.id === selectedPatientId);
  const sessions = selectedPatientId
    ? getSessionsForPatient(selectedPatientId)
    : [];

  const latestSession = sessions[0];
  const cnn = latestSession?.cnnOutput;
  const recentRecords = getRecentSoundRecords(selectedPatientId ?? "");

  const handleReferral = async () => {
    if (!patient || !cnn) return;
    setSending(true);

    const packet = referralService.buildReferralPacket(
      patient,
      cnn,
      recentRecords,
      latestSession?.symptoms ?? [],
      "AI screening completed",
    );
    const result = await referralService.submitToESanjeevani(packet);

    if (result.success) {
      setReferralId(result.referralId);
      setSent(true);
      if (latestSession) {
        updateSession(latestSession.id, {
          referralStatus: "recommended",
          referralTimestamp: new Date().toISOString(),
        });
      }
    }
    setSending(false);
  };

  const riskColor =
    cnn?.pneumoniaRiskBucket === "high"
      ? "#DC2626"
      : cnn?.pneumoniaRiskBucket === "medium"
        ? "#D97706"
        : "#059669";

  return (
    <View style={styles.container}>
      <Header
        title={t("telemedicine.title")}
        subtitle={t("telemedicine.subtitle")}
        showBack
      />
      <ScrollView contentContainerStyle={styles.content}>
        {patient && (
          <Card variant="elevated" style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{t("telemedicine.summary")}</Text>
            <Text style={styles.line}>Patient: {patient.name}</Text>
            <Text style={styles.line}>
              Age: {patient.age} | Sex: {patient.sex}
            </Text>
            {cnn && (
              <>
                <View
                  style={[
                    styles.riskPill,
                    { backgroundColor: `${riskColor}12` },
                  ]}
                >
                  <Text style={[styles.riskPillText, { color: riskColor }]}>
                    Pneumonia Risk: {cnn.pneumoniaRiskBucket.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.line}>
                  Confidence: {(cnn.confidence * 100).toFixed(0)}% • Signal:{" "}
                  {cnn.signalSource}
                </Text>
              </>
            )}
          </Card>
        )}

        {sent ? (
          <Card variant="elevated" style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>
              {t("telemedicine.referralSent")}
            </Text>
            <Text style={styles.refId}>Referral ID: {referralId}</Text>
            <Button
              title={t("common.done")}
              onPress={() => router.replace("/home")}
              style={styles.doneBtn}
            />
            <Button
              title="Call Doctor"
              onPress={() => router.push("/doctor-call")}
              variant="danger"
              style={styles.doneBtn}
            />
          </Card>
        ) : (
          <View style={styles.actions}>
            <Button
              title={t("telemedicine.connectNow")}
              onPress={handleReferral}
              loading={sending}
              variant="danger"
            />
            <Button
              title="Chat Doctor First"
              onPress={() => router.push("/doctor-chat")}
              variant="secondary"
            />
            <Button
              title="Call Doctor"
              onPress={() => router.push("/doctor-call")}
              variant="danger"
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { padding: 16, paddingBottom: 40 },
  summaryCard: { marginBottom: 24 },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  line: { fontSize: 13, color: "#4B5563", marginBottom: 4 },
  riskPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginVertical: 6,
  },
  riskPillText: { fontSize: 13, fontWeight: "700" },
  actions: { gap: 12 },
  successCard: { alignItems: "center", paddingVertical: 32 },
  successIcon: { fontSize: 48, color: "#0D9488", marginBottom: 12 },
  successTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  refId: { fontSize: 13, color: "#4B5563", marginTop: 6 },
  doneBtn: { marginTop: 16 },
});
