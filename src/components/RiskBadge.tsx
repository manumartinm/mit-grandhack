import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import type { RiskBucket } from "../types";

interface RiskBadgeProps {
  risk: RiskBucket;
  label?: string;
  size?: "sm" | "lg";
}

const bgMap = {
  low: colors.risk.lowBg,
  medium: colors.risk.mediumBg,
  high: colors.risk.highBg,
};

export function RiskBadge({ risk, label, size = "sm" }: RiskBadgeProps) {
  const labels = { low: "Low Risk", medium: "Medium Risk", high: "HIGH RISK" };
  const isHigh = risk === "high";

  return (
    <View
      style={[
        styles.base,
        isHigh ? styles.highBadge : { backgroundColor: bgMap[risk] },
        size === "lg" && styles.large,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Risk level: ${label ?? labels[risk]}`}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: isHigh ? "#fff" : colors.risk[risk] },
        ]}
        importantForAccessibility="no"
      />
      <Text
        style={[
          styles.text,
          { color: isHigh ? "#fff" : colors.risk[risk] },
          size === "lg" && styles.textLg,
        ]}
        maxFontSizeMultiplier={1.5}
      >
        {label ?? labels[risk]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 5,
  },
  highBadge: {
    backgroundColor: colors.risk.high,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  large: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  textLg: {
    fontSize: 15,
    lineHeight: 20,
  },
});
