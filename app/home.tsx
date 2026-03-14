import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from '../src/i18n';
import { Card, Button, StatCard, RiskBadge } from '../src/components';
import { usePatientStore } from '../src/stores/usePatientStore';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useOutbreakStore } from '../src/stores/useOutbreakStore';
import { format } from 'date-fns';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const patients = usePatientStore((s) => s.patients);
  const sessions = usePatientStore((s) => s.sessions);
  const todayCount = usePatientStore((s) => s.getTodaySessionCount());
  const highRiskPatients = usePatientStore((s) => s.getHighRiskPatients());
  const activeAlerts = useOutbreakStore((s) => s.getActiveAlerts());
  const syncFromServer = usePatientStore((s) => s.syncFromServer);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
      return;
    }
    if (token) {
      syncFromServer(token);
    }
  }, [isAuthenticated, token]);

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  const recentSessions = sessions
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 5);

  const getPatientName = (patientId: string) => {
    return patients.find((pt) => pt.id === patientId)?.name ?? 'Unknown';
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>
            {t('home.greeting')}, {user?.full_name ?? 'Doctor'}
          </Text>
          <Text style={styles.date}>{format(new Date(), 'EEEE, MMMM d')}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.langToggle}
            onPress={() => i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.langText}>{i18n.language === 'en' ? 'HI' : 'EN'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {user && (
        <View style={styles.userBadge}>
          <Text style={styles.userBadgeText}>{user.email} ({user.role})</Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatCard label={t('home.todayScreenings')} value={todayCount} accentColor="#0D9488" />
        <StatCard label={t('home.totalPatients')} value={patients.length} accentColor="#2563EB" />
      </View>
      <View style={styles.statsRow}>
        <StatCard label={t('home.highRisk')} value={highRiskPatients.length} accentColor="#DC2626" />
        <StatCard label={t('home.outbreakAlerts')} value={activeAlerts.length} accentColor="#D97706" />
      </View>

      {activeAlerts.length > 0 && (
        <TouchableOpacity onPress={() => router.push('/outbreak')} activeOpacity={0.7}>
          <Card style={styles.alertBanner}>
            <Text style={styles.alertIcon}>&#x26A0;&#xFE0F;</Text>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>{t('outbreak.title')}</Text>
              <Text style={styles.alertText}>
                {t('outbreak.casesDetected', { count: activeAlerts[0].caseCount })}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      )}

      <View style={styles.actions}>
        <Button title={t('home.startScreening')} onPress={() => router.push('/patients')} style={styles.primaryBtn} />
        <Button title={t('home.patientRoster')} onPress={() => router.push('/patients')} variant="secondary" />
      </View>

      {recentSessions.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Screenings</Text>
          {recentSessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              onPress={() => {
                usePatientStore.getState().selectPatient(session.patientId);
                router.push('/screening/results');
              }}
              activeOpacity={0.7}
              style={styles.sessionTouch}
            >
              <Card variant="elevated" style={styles.sessionCard}>
                <View style={styles.sessionRow}>
                  <View>
                    <Text style={styles.sessionPatient}>{getPatientName(session.patientId)}</Text>
                    <Text style={styles.sessionTime}>{format(new Date(session.startedAt), 'h:mm a')}</Text>
                  </View>
                  {session.cnnOutput && <RiskBadge risk={session.cnnOutput.pneumoniaRiskBucket} />}
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', gap: 8 },
  greeting: { fontSize: 22, fontWeight: '700', color: '#111827' },
  date: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  langToggle: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  langText: { color: '#0D9488', fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  logoutText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  userBadge: {
    backgroundColor: '#F5F7FA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  userBadgeText: { fontSize: 12, color: '#6B7280' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  alertIcon: { fontSize: 24 },
  alertContent: { flex: 1 },
  alertTitle: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  alertText: { fontSize: 12, color: '#111827', marginTop: 2 },
  actions: { gap: 12, marginBottom: 24 },
  primaryBtn: { minHeight: 52 },
  recentSection: { marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  sessionTouch: { marginBottom: 8 },
  sessionCard: {},
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionPatient: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sessionTime: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
