import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
} from "react-native";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function InputField({ label, error, style, ...props }: InputFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label} maxFontSizeMultiplier={2}>
        {label}
      </Text>
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={colors.text.muted}
        accessibilityLabel={label}
        accessibilityHint={
          props.placeholder ? String(props.placeholder) : undefined
        }
        {...props}
      />
      {error && (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={2}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.text.primary,
    ...typography.body,
  },
  inputError: { borderColor: colors.accent.coral },
  error: {
    ...typography.caption,
    color: colors.accent.coral,
    marginTop: spacing.xs,
  },
});
