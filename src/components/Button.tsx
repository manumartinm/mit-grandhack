import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'lg' | 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const bgColor = {
    primary: colors.accent.teal,
    secondary: colors.bg.secondary,
    danger: colors.accent.coral,
    ghost: 'transparent',
  }[variant];

  const textColor = {
    primary: colors.text.inverse,
    secondary: colors.text.primary,
    danger: colors.text.inverse,
    ghost: colors.accent.teal,
  }[variant];

  const height = { lg: 52, md: 44, sm: 34 }[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.base,
        {
          backgroundColor: bgColor,
          height,
          opacity: disabled ? 0.4 : 1,
          borderWidth: variant === 'ghost' ? 1 : variant === 'secondary' ? 1 : 0,
          borderColor: variant === 'ghost' ? colors.accent.teal : colors.border.default,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: textColor }, size === 'sm' && typography.caption]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  text: {
    ...typography.bodyBold,
    textAlign: 'center',
  },
});
