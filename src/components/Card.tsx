import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'risk';
  riskLevel?: 'low' | 'medium' | 'high';
}

export function Card({ variant = 'default', riskLevel, style, children, ...props }: CardProps) {
  const borderColor =
    variant === 'risk' && riskLevel
      ? colors.risk[riskLevel]
      : colors.border.subtle;

  return (
    <View
      style={[
        styles.base,
        variant === 'elevated' && styles.elevated,
        variant === 'risk' && { borderLeftWidth: 3, borderLeftColor: borderColor },
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
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderColor: colors.border.subtle,
  },
});
