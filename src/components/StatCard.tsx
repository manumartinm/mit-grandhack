import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from './Card';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

interface StatCardProps {
  label: string;
  value: string | number;
  accentColor?: string;
  icon?: React.ReactNode;
}

export function StatCard({ label, value, accentColor = colors.accent.teal, icon }: StatCardProps) {
  return (
    <Card variant="elevated" style={styles.card}>
      <View style={styles.header}>
        {icon}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.value, { color: accentColor }]}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  label: { ...typography.caption, color: colors.text.secondary },
  value: { ...typography.stat },
});
