import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";
import { glass } from "../theme/glass";

interface CardProps extends ViewProps {
  variant?: "default" | "elevated" | "risk";
  riskLevel?: "low" | "medium" | "high";
}

export function Card({
  variant = "default",
  riskLevel,
  style,
  children,
  ...props
}: CardProps) {
  const borderColor =
    variant === "risk" && riskLevel
      ? colors.risk[riskLevel]
      : colors.border.subtle;

  return (
    <View
      style={[
        styles.base,
        variant === "elevated" && styles.elevated,
        variant === "risk" && {
          borderLeftWidth: 3,
          borderLeftColor: borderColor,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: glass.surface.default,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: glass.border.default,
  },
  elevated: {
    backgroundColor: glass.surface.elevated,
    shadowColor: glass.shadow.color,
    shadowOffset: { width: 0, height: glass.shadow.offsetY },
    shadowOpacity: glass.shadow.opacity,
    shadowRadius: glass.shadow.radius,
    elevation: glass.shadow.elevation,
    borderColor: glass.border.strong,
  },
});
