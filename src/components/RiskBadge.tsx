import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import type { RiskBucket } from '../types';

interface RiskBadgeProps {
  risk: RiskBucket;
  label?: string;
  size?: 'sm' | 'lg';
}

const bgMap = { low: colors.risk.lowBg, medium: colors.risk.mediumBg, high: colors.risk.highBg };

export function RiskBadge({ risk, label, size = 'sm' }: RiskBadgeProps) {
  const labels = { low: 'LOW', medium: 'MED', high: 'HIGH' };

  return (
    <View style={[styles.base, { backgroundColor: bgMap[risk] }, size === 'lg' && styles.large]}>
      <View style={[styles.dot, { backgroundColor: colors.risk[risk] }]} />
      <Text style={[styles.text, { color: colors.risk[risk] }, size === 'lg' && typography.caption]}>
        {label ?? labels[risk]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    gap: 4,
  },
  large: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...typography.small,
    fontSize: 10,
  },
});
