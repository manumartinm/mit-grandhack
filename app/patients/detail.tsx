import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Header, Card, Button, RiskBadge } from '../../src/components';
import { usePatientStore } from '../../src/stores/usePatientStore';
import { format } from 'date-fns';

export default function PatientDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const selectedId = usePatientStore((s) => s.selectedPatientId);
  const patient = usePatientStore((s) => s.patients.find((p) => p.id === selectedId));
  const sessions = usePatientStore((s) =>
    s.sessions.filter((ses) => ses.patientId === selectedId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  );

  if (!patient) {
    return (
      <View style={styles.container}>
        <Header title={t('patient.title')} showBack />
        <Text style={styles.emptyText}>Patient not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={patient.name} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        {patient.age < 5 && (
          <View style={styles.pediatricBanner}>
            <Text style={styles.pediatricText}>👶 {t('patient.pediatricAlert')}</Text>
          </View>
        )}

        <Card variant="elevated" style={styles.infoCard}>
          <View style={styles.infoRow}>
            <InfoItem label={t('patient.age')} value={`${patient.age} years`} />
            <InfoItem label={t('patient.sex')} value={patient.sex} />
            {patient.weight && <InfoItem label={t('patient.weight')} value={`${patient.weight} kg`} />}
          </View>
          <InfoItem label={t('patient.village')} value={patient.village} />
          {patient.comorbidities.length > 0 && <InfoItem label={t('patient.comorbidities')} value={patient.comorbidities.join(', ')} />}
          {patient.medications.length > 0 && <InfoItem label={t('patient.medications')} value={patient.medications.join(', ')} />}
          {patient.allergies.length > 0 && <InfoItem label={t('patient.allergies')} value={patient.allergies.join(', ')} />}
        </Card>

        <Button title={t('home.startScreening')} onPress={() => router.push('/screening')} style={styles.screenBtn} />

        <Text style={styles.sectionTitle}>{t('patient.history')}</Text>
        {sessions.length === 0 && <Text style={styles.noHistory}>{t('patient.noHistory')}</Text>}
        {sessions.map((session) => (
          <TouchableOpacity
            key={session.id}
            onPress={() => router.push('/screening/results')}
            activeOpacity={0.7}
            style={styles.sessionCardTouch}
          >
            <Card variant={session.cnnOutput ? 'risk' : 'default'} riskLevel={session.cnnOutput?.pneumoniaRiskBucket} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionDate}>{format(new Date(session.startedAt), 'MMM d, h:mm a')}</Text>
                {session.cnnOutput && <RiskBadge risk={session.cnnOutput.pneumoniaRiskBucket} />}
              </View>
              {session.cnnOutput && (
                <Text style={styles.sessionLabel}>
                  Source: {session.signalSource} • Confidence: {(session.cnnOutput.confidence * 100).toFixed(0)}% • Trend: {session.cnnOutput.trend}
                </Text>
              )}
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 40 },
  emptyText: { color: '#9CA3AF', textAlign: 'center', marginTop: 40, fontSize: 15 },
  pediatricBanner: {
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  pediatricText: { color: '#D97706', fontSize: 13, fontWeight: '500' },
  infoCard: { marginBottom: 16 },
  infoRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  infoItem: { marginBottom: 8 },
  infoLabel: { fontSize: 11, fontWeight: '500', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, color: '#111827', marginTop: 2 },
  screenBtn: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  noHistory: { color: '#9CA3AF', fontSize: 14 },
  sessionCardTouch: { marginBottom: 8, minHeight: 64 },
  sessionCard: {},
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionDate: { fontSize: 14, fontWeight: '600', color: '#111827' },
  sessionLabel: { fontSize: 12, color: '#6B7280', marginTop: 6 },
});
