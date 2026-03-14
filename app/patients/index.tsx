import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Header, Card, Button, RiskBadge } from '../../src/components';
import { usePatientStore } from '../../src/stores/usePatientStore';

export default function PatientRosterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const patients = usePatientStore((s) => s.patients);
  const sessions = usePatientStore((s) => s.sessions);
  const selectPatient = usePatientStore((s) => s.selectPatient);
  const [search, setSearch] = useState('');
  const [sortByRisk, setSortByRisk] = useState(false);

  const getLatestRisk = (patientId: string) => {
    const patientSessions = sessions
      .filter((s) => s.patientId === patientId && s.cnnOutput)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return patientSessions[0]?.cnnOutput?.pneumoniaRiskBucket;
  };

  const filtered = useMemo(() => {
    let list = patients.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.village.toLowerCase().includes(search.toLowerCase())
    );
    if (sortByRisk) {
      const riskOrder = { high: 0, medium: 1, low: 2, undefined: 3 };
      list = [...list].sort(
        (a, b) =>
          (riskOrder[getLatestRisk(a.id) as keyof typeof riskOrder] ?? 3) -
          (riskOrder[getLatestRisk(b.id) as keyof typeof riskOrder] ?? 3)
      );
    }
    return list;
  }, [patients, sessions, search, sortByRisk]);

  return (
    <View style={styles.container}>
      <Header title={t('home.patientRoster')} showBack />
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or village..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={[styles.sortBtn, sortByRisk && styles.sortBtnActive]}
          onPress={() => setSortByRisk(!sortByRisk)}
          activeOpacity={0.7}
        >
          <Text style={[styles.sortText, sortByRisk && styles.sortTextActive]}>Risk ↓</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No patients yet. Add your first patient to begin screening.</Text>
          </View>
        )}
        {filtered.map((patient) => {
          const risk = getLatestRisk(patient.id);
          return (
            <TouchableOpacity
              key={patient.id}
              onPress={() => { selectPatient(patient.id); router.push('/patients/detail'); }}
              activeOpacity={0.7}
              style={styles.patientCardTouch}
            >
              <Card variant="elevated" style={styles.patientCard}>
                <View style={styles.patientRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{patient.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.patientInfo}>
                    <Text style={styles.patientName}>{patient.name}</Text>
                    <Text style={styles.patientMeta}>
                      {patient.age}y • {patient.sex} • {patient.village}
                      {patient.age < 5 ? ' • 👶 Pediatric' : ''}
                    </Text>
                  </View>
                  {risk && <RiskBadge risk={risk} />}
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.fab}>
        <Button title={`+ ${t('patient.addNew')}`} onPress={() => router.push('/patients/add')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: '#F5F7FA', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#111827', fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB',
  },
  sortBtn: {
    backgroundColor: '#F5F7FA', paddingHorizontal: 16, paddingVertical: 14, minHeight: 48, minWidth: 48,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  sortBtnActive: { backgroundColor: '#CCFBF1', borderColor: '#0D9488' },
  sortText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  sortTextActive: { color: '#0D9488' },
  list: { padding: 16, paddingBottom: 100 },
  patientCardTouch: { marginBottom: 8, minHeight: 72 },
  patientCard: {},
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#CCFBF1',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#0D9488', fontSize: 18, fontWeight: '700' },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  patientMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16 },
});
