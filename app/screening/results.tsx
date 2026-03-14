import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Header, Card, Button, RiskBadge } from '../../src/components';
import { usePatientStore } from '../../src/stores/usePatientStore';

export default function ResultsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const selectedPatientId = usePatientStore((s) => s.selectedPatientId);
  const patient = usePatientStore((s) =>
    s.patients.find((p) => p.id === selectedPatientId)
  );
  const latestSession = usePatientStore((s) =>
    s.sessions
      .filter((ses) => ses.patientId === selectedPatientId)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )[0]
  );

  const cnn = latestSession?.cnnOutput;
  const riskColor = { low: '#059669', medium: '#D97706', high: '#DC2626' };
  const riskBg = { low: '#ECFDF5', medium: '#FFFBEB', high: '#FEF2F2' };
  const trendIcon = { improving: '↗', stable: '→', worsening: '↘', first_session: '◉' };

  return (
    <View style={styles.container}>
      <Header title={t('screening.results')} subtitle={patient?.name} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        {cnn && (
          <>
            <View style={[styles.riskCard, { backgroundColor: riskBg[cnn.pneumoniaRiskBucket] }]}>
              <RiskBadge
                risk={cnn.pneumoniaRiskBucket}
                size="lg"
                label={t(`risk.${cnn.pneumoniaRiskBucket}`)}
              />
              <Text style={[styles.riskTitle, { color: riskColor[cnn.pneumoniaRiskBucket] }]}>
                {t(`risk.${cnn.pneumoniaRiskBucket}`)}
              </Text>
              <Text style={styles.stat}>
                {t('risk.pneumonia')}: {((cnn.classProbabilities['Pneumonia'] ?? 0) * 100).toFixed(1)}%
              </Text>
              <Text style={styles.stat}>
                {t('risk.confidence')}: {(cnn.confidence * 100).toFixed(0)}%
              </Text>
              <View style={styles.trendRow}>
                <Text style={styles.trendIcon}>{trendIcon[cnn.trend]}</Text>
                <Text style={styles.trendText}>
                  {t(`risk.${cnn.trend === 'first_session' ? 'firstSession' : cnn.trend}`)}
                </Text>
              </View>
            </View>

            {cnn.guardrails.requiresDoctorEscalation && (
              <Card style={styles.escCard}>
                <Text style={styles.escTitle}>⚠️ {t('ai.escalation')}</Text>
                {cnn.guardrails.escalationReason && (
                  <Text style={styles.escReason}>{cnn.guardrails.escalationReason}</Text>
                )}
                <Button
                  title={t('telemedicine.connectNow')}
                  onPress={() => router.push('/telemedicine')}
                  variant="danger"
                  style={styles.escBtn}
                />
              </Card>
            )}

            <Card variant="elevated" style={styles.probCard}>
              <Text style={styles.probTitle}>Class Probabilities</Text>
              {Object.entries(cnn.classProbabilities)
                .sort(([, a], [, b]) => b - a)
                .map(([label, prob]) => (
                  <View key={label} style={styles.probRow}>
                    <Text style={styles.probLabel}>{label}</Text>
                    <View style={styles.probBg}>
                      <View
                        style={[
                          styles.probFill,
                          {
                            width: `${prob * 100}%`,
                            backgroundColor:
                              label === 'Pneumonia'
                                ? riskColor[cnn.pneumoniaRiskBucket]
                                : '#2563EB',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.probVal}>{(prob * 100).toFixed(1)}%</Text>
                  </View>
                ))}
            </Card>

            <Card variant="elevated" style={styles.metaCard}>
              <Text style={styles.meta}>
                Signal: {cnn.signalSource} • Quality:{' '}
                {(cnn.signalQuality.qualityScore * 100).toFixed(0)}% • Duration:{' '}
                {cnn.signalQuality.durationSec}s
              </Text>
            </Card>
          </>
        )}

        <View style={styles.actions}>
          <Button title={t('ai.title')} onPress={() => router.push('/ai-assistant')} variant="secondary" />
          <Button title={t('telemedicine.title')} onPress={() => router.push('/telemedicine')} variant="secondary" />
          <Button title={t('common.done')} onPress={() => router.replace('/home')} />
        </View>
        <Text style={styles.disclaimer}>{t('ai.disclaimer')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 40 },
  riskCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  riskTitle: { fontSize: 26, fontWeight: '700', marginTop: 8 },
  stat: { fontSize: 15, color: '#111827', marginTop: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  trendIcon: { fontSize: 18, color: '#111827' },
  trendText: { fontSize: 14, color: '#6B7280' },
  escCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
    borderWidth: 1,
    marginBottom: 16,
  },
  escTitle: { fontSize: 15, fontWeight: '700', color: '#DC2626', marginBottom: 4 },
  escReason: { fontSize: 13, color: '#111827', marginBottom: 4 },
  escBtn: { marginTop: 8 },
  probCard: { marginBottom: 12 },
  probTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 12 },
  probRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  probLabel: { width: 100, fontSize: 13, color: '#6B7280' },
  probBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  probFill: { height: '100%', borderRadius: 4 },
  probVal: { width: 48, fontSize: 12, color: '#111827', textAlign: 'right' },
  metaCard: { marginBottom: 16 },
  meta: { fontSize: 13, color: '#6B7280' },
  actions: { gap: 10, marginBottom: 16 },
  disclaimer: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16 },
});
