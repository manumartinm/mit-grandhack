import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from "react-native";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "lg" | "md" | "sm";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "lg",
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const bgColor = {
    primary: colors.palette.primaryBlue,
    secondary: "rgba(255, 255, 255, 0.62)",
    danger: colors.palette.urgentCoral,
    ghost: "transparent",
  }[variant];

  const textColor = {
    primary: colors.text.inverse,
    secondary: colors.text.primary,
    danger: colors.text.inverse,
    ghost: colors.palette.primaryBlue,
  }[variant];

  const height = { lg: 58, md: 52, sm: 44 }[size];
  const fontSize = { lg: 17, md: 16, sm: 14 }[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        styles.base,
        {
          backgroundColor: bgColor,
          height,
          opacity: disabled ? 0.45 : 1,
          borderWidth:
            variant === "ghost" ? 1.5 : variant === "secondary" ? 1 : 0,
          borderColor:
            variant === "ghost"
              ? colors.palette.primaryBlue
              : colors.border.default,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              { color: textColor, fontSize },
              size === "sm" && { fontSize: 14 },
            ]}
            maxFontSizeMultiplier={1.5}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  text: {
    ...typography.bodyBold,
    textAlign: "center",
    letterSpacing: 0.1,
  },
});
