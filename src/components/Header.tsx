import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { glass } from "../theme/glass";
import { useAuth } from "../providers/AuthProvider";

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  rightAction,
}: HeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const initials =
    (user?.full_name ?? user?.email ?? "SS")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "SS";

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.logoBadge}>
          <Ionicons name="pulse-outline" size={16} color="#FFFFFF" />
        </View>
        {showBack && (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel={t("accessibility.goBack")}
            accessibilityHint="Navigates to previous screen"
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={colors.text.primary}
            />
          </TouchableOpacity>
        )}
        <View>
          <Text style={styles.brand}>Sthetho Scan</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightAction ? (
        <View>{rightAction}</View>
      ) : (
        <TouchableOpacity
          onPress={() => router.push("/profile")}
          style={styles.avatarBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t("accessibility.openProfile")}
          accessibilityHint="Navigates to your profile settings"
        >
          <Text style={styles.avatarText} maxFontSizeMultiplier={2}>
            {initials}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md + 10,
    paddingBottom: spacing.sm + 2,
    backgroundColor: "rgba(243, 248, 253, 0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(4,44,83,0.08)",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  logoBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.palette.primaryBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: glass.surface.elevated,
    borderWidth: 1,
    borderColor: glass.border.default,
  },
  brand: {
    fontSize: 11,
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    fontWeight: "700",
    marginBottom: 2,
  },
  title: { ...typography.h3, color: colors.text.primary, fontSize: 19 },
  subtitle: {
    ...typography.small,
    color: colors.text.secondary,
    marginTop: 1,
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 13,
  },
  avatarBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.palette.primaryBlue,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
