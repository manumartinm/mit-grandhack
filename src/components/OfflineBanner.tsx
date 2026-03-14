import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNetwork } from "../providers/NetworkProvider";
import { useTranslation } from "react-i18next";

export function OfflineBanner() {
  const { t } = useTranslation();
  const { isConnected } = useNetwork();

  if (isConnected) return null;

  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessible
    >
      <Text style={styles.text}>{t("accessibility.offlineBanner")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#7C2D12",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
});
