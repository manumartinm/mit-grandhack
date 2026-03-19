import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header, InputField, Button } from "../../src/components";
import { usePatients } from "../../src/providers/PatientProvider";
import { useAuth } from "../../src/providers/AuthProvider";
import type { Patient } from "../../src/types";
import { isLikelyOfflineError } from "../../src/config/api";

export default function AddPatientScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { addPatientWithSync, addPatient: addPatientLocal } = usePatients();
  const { token, user } = useAuth();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "other">("male");
  const [weight, setWeight] = useState("");
  const [village, setVillage] = useState("");
  const [comorbidities, setComorbidities] = useState("");
  const [vaccinations, setVaccinations] = useState("");
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaveError(null);

    const patient: Patient = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      age: parseInt(age, 10) || 0,
      sex,
      weight: weight ? parseFloat(weight) : undefined,
      village: village.trim(),
      ashaWorkerId: user ? String(user.id) : "self",
      comorbidities: comorbidities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      vaccinations: vaccinations
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      medications: medications
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      allergies: allergies
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      priorDiagnoses: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (token) {
        await addPatientWithSync(patient, token);
      } else {
        addPatientLocal(patient);
      }
      router.back();
    } catch (error) {
      setSaveError(
        isLikelyOfflineError(error)
          ? "You're offline. Patient was saved locally and will sync later."
          : "Could not save patient. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const isPediatric = parseInt(age, 10) > 0 && parseInt(age, 10) < 5;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={8}
    >
      <Header title={t("patient.addNew")} showBack />
      <ScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {isPediatric && (
          <View style={styles.pediatricBanner}>
            <Text style={styles.pediatricText}>
              {t("patient.pediatricAlert")}
            </Text>
          </View>
        )}
        {saveError && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}
        <InputField
          label={t("patient.name")}
          value={name}
          onChangeText={setName}
          placeholder="Patient full name"
        />
        <InputField
          label={t("patient.age")}
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
          placeholder="Age in years"
        />

        <Text style={styles.fieldLabel}>{t("patient.sex")}</Text>
        <View style={styles.sexRow}>
          {(["male", "female", "other"] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sexBtn, sex === s && styles.sexBtnActive]}
              onPress={() => setSex(s)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityLabel={`Sex ${t(`patient.${s}`)}`}
              accessibilityState={{ selected: sex === s }}
            >
              <Text style={[styles.sexText, sex === s && styles.sexTextActive]}>
                {t(`patient.${s}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <InputField
          label={t("patient.weight")}
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="Optional"
        />
        <InputField
          label={t("patient.village")}
          value={village}
          onChangeText={setVillage}
        />
        <InputField
          label={t("patient.comorbidities")}
          value={comorbidities}
          onChangeText={setComorbidities}
          placeholder="Comma separated"
        />
        <InputField
          label={t("patient.vaccinations")}
          value={vaccinations}
          onChangeText={setVaccinations}
          placeholder="Comma separated"
        />
        <InputField
          label={t("patient.medications")}
          value={medications}
          onChangeText={setMedications}
          placeholder="Comma separated"
        />
        <InputField
          label={t("patient.allergies")}
          value={allergies}
          onChangeText={setAllergies}
          placeholder="Comma separated"
        />

        <Button
          title={saving ? "Saving..." : t("common.save")}
          onPress={handleSave}
          style={styles.saveBtn}
          disabled={saving}
        />
        {saving && (
          <ActivityIndicator style={{ marginTop: 8 }} color="#0D9488" />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  form: { padding: 16, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 8,
  },
  sexRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  sexBtn: {
    flex: 1,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#F5F7FA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sexBtnActive: { backgroundColor: "#CCFBF1", borderColor: "#0D9488" },
  sexText: { color: "#4B5563", fontSize: 14, fontWeight: "600" },
  sexTextActive: { color: "#0D9488" },
  saveBtn: { marginTop: 12 },
  pediatricBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pediatricText: { color: "#D97706", fontSize: 13, fontWeight: "500" },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    textAlign: "center",
  },
});
