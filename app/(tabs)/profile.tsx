import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput } from "react-native";
import { Card, Button, GlassSurface } from "../../src/components";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme/colors";

export default function ProfileScreen() {
  const { user, profile, updateProfile } = useAuth();
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [language, setLanguage] = useState<string>(
    profile?.preferredLanguage ?? "en",
  );
  const [emergencyName, setEmergencyName] = useState(
    profile?.emergencyContactName ?? "",
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    profile?.emergencyContactPhone ?? "",
  );
  const [saved, setSaved] = useState(false);

  const initials = useMemo(() => {
    const name = user?.full_name?.trim() ?? "P U";
    return name
      .split(" ")
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [user?.full_name]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <GlassSurface elevated style={styles.emailBanner}>
          <Text style={styles.emailLabel}>Signed in as</Text>
          <Text style={styles.emailValue}>{user?.email ?? "unknown"}</Text>
        </GlassSurface>
        <Card style={styles.avatarCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.full_name ?? "User"}</Text>
          <Text style={styles.role}>{user?.role ?? "patient"}</Text>
        </Card>

        <Card style={styles.formCard}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+91..."
            placeholderTextColor={colors.text.muted}
            accessibilityLabel="Phone number"
          />
          <Text style={styles.label}>Preferred language</Text>
          <TextInput
            style={styles.input}
            value={language}
            onChangeText={setLanguage}
            placeholder="en / hi"
            placeholderTextColor={colors.text.muted}
            accessibilityLabel="Preferred language"
          />
          <Text style={styles.label}>Emergency contact name</Text>
          <TextInput
            style={styles.input}
            value={emergencyName}
            onChangeText={setEmergencyName}
            placeholder="Name"
            placeholderTextColor={colors.text.muted}
            accessibilityLabel="Emergency contact name"
          />
          <Text style={styles.label}>Emergency contact phone</Text>
          <TextInput
            style={styles.input}
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            placeholder="+91..."
            placeholderTextColor={colors.text.muted}
            accessibilityLabel="Emergency contact phone"
          />
          <Button
            title={saved ? "Saved" : "Save profile"}
            onPress={async () => {
              await updateProfile({
                phone,
                preferredLanguage: language as "en" | "hi",
                emergencyContactName: emergencyName,
                emergencyContactPhone: emergencyPhone,
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            }}
            style={styles.saveBtn}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: 16, gap: 12, paddingBottom: 110 },
  emailBanner: { padding: 14 },
  emailLabel: { color: colors.text.secondary, fontSize: 12, fontWeight: "600" },
  emailValue: {
    color: colors.text.primary,
    fontSize: 14,
    marginTop: 4,
    fontWeight: "700",
  },
  avatarCard: { alignItems: "center", gap: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.palette.primaryBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 26, fontWeight: "700" },
  name: { fontSize: 20, fontWeight: "700", color: colors.text.primary },
  role: { color: colors.text.secondary, fontSize: 13 },
  formCard: {},
  label: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 5,
    marginTop: 10,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: "rgba(255,255,255,0.68)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
  },
  saveBtn: { marginTop: 14 },
});
