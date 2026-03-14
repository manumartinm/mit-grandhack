import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Header, Card, Button } from '../src/components';
import { useOutbreakStore } from '../src/stores/useOutbreakStore';
import { format } from 'date-fns';

export default function OutbreakScreen() {
  const { t } = useTranslation();
  const alerts = useOutbreakStore((s) => s.alerts);
  const acknowledgeAlert = useOutbreakStore((s) => s.acknowledgeAlert);

  return (
    <View style={styles.container}>
      <Header
        title={t('outbreak.title')}
        subtitle={t('outbreak.subtitle')}
        showBack
      />
      <ScrollView contentContainerStyle={styles.content}>
        {alerts.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>{t('home.noAlerts')}</Text>
          </View>
        )}
        {alerts.map((alert) => (
          <Card
            key={alert.id}
            style={[styles.alertCard, alert.acknowledged && styles.acked]}
          >
            <View style={styles.alertHeader}>
              <Text style={styles.alertIcon}>⚠️</Text>
              <View style={styles.alertInfo}>
                <Text style={styles.alertTitle}>{alert.caseCount} cases in cluster</Text>
                <Text style={styles.alertTime}>
                  {format(new Date(alert.detectedAt), 'MMM d, h:mm a')}
                </Text>
              </View>
              {alert.acknowledged && (
                <View style={styles.ackBadge}>
                  <Text style={styles.ackText}>ACK</Text>
                </View>
              )}
            </View>
            <Text style={styles.detail}>
              Radius: {alert.radiusKm}km • Sessions: {alert.sessionIds.length}
            </Text>
            {alert.centerLat != null && alert.centerLon != null && (
              <Text style={styles.detail}>
                GPS: {alert.centerLat.toFixed(4)}, {alert.centerLon.toFixed(4)}
              </Text>
            )}
            {!alert.acknowledged && (
              <View style={styles.alertActions}>
                <Button
                  title={t('outbreak.acknowledge')}
                  onPress={() => acknowledgeAlert(alert.id)}
                  size="sm"
                  variant="secondary"
                />
                <Button
                  title={t('outbreak.reportToSupervisor')}
                  onPress={() => {}}
                  size="sm"
                  variant="danger"
                />
              </View>
            )}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 44, marginBottom: 12, color: '#0D9488' },
  emptyText: { fontSize: 16, color: '#6B7280' },
  alertCard: {
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  acked: { opacity: 0.5, borderLeftColor: '#9CA3AF' },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  alertIcon: { fontSize: 22 },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 16, fontWeight: '700', color: '#DC2626' },
  alertTime: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  ackBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ackText: { fontSize: 10, color: '#6B7280', fontWeight: '700' },
  detail: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  alertActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
