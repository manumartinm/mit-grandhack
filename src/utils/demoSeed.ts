import { usePatientStore } from '../stores/usePatientStore';
import { useOutbreakStore } from '../stores/useOutbreakStore';
import type { Patient, ScreeningSession, CNNOutputTool, OutbreakAlert } from '../types';

export function seedDemoData() {
  const patients = usePatientStore.getState();
  const outbreaks = useOutbreakStore.getState();

  if (patients.patients.length > 0) return;

  const workerId = 'demo-user';

  const demoPatients: Patient[] = [
    {
      id: 'p1',
      name: 'Arjun Patel',
      age: 3,
      sex: 'male',
      weight: 12,
      village: 'Rampur',
      ashaWorkerId: workerId,
      comorbidities: ['Malnutrition'],
      vaccinations: ['BCG', 'Polio'],
      medications: [],
      allergies: [],
      priorDiagnoses: [],
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p2',
      name: 'Sunita Devi',
      age: 45,
      sex: 'female',
      village: 'Rampur',
      ashaWorkerId: workerId,
      comorbidities: ['COPD', 'Diabetes'],
      vaccinations: [],
      medications: ['Metformin', 'Salbutamol inhaler'],
      allergies: ['Penicillin'],
      priorDiagnoses: ['COPD'],
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p3',
      name: 'Ravi Kumar',
      age: 28,
      sex: 'male',
      village: 'Rampur',
      ashaWorkerId: workerId,
      comorbidities: [],
      vaccinations: ['BCG', 'DPT', 'Polio'],
      medications: [],
      allergies: [],
      priorDiagnoses: [],
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p4',
      name: 'Lakshmi Bai',
      age: 65,
      sex: 'female',
      village: 'Rampur',
      ashaWorkerId: workerId,
      comorbidities: ['Hypertension'],
      vaccinations: [],
      medications: ['Amlodipine'],
      allergies: [],
      priorDiagnoses: ['Bronchitis'],
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p5',
      name: 'Baby Meera',
      age: 1,
      sex: 'female',
      weight: 7,
      village: 'Rampur',
      ashaWorkerId: workerId,
      comorbidities: ['Low birth weight'],
      vaccinations: ['BCG'],
      medications: [],
      allergies: [],
      priorDiagnoses: [],
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  demoPatients.forEach((p) => patients.addPatient(p));

  const makeCnn = (
    sessionId: string,
    patientId: string,
    pneumoniaProb: number,
    risk: 'low' | 'medium' | 'high',
    trend: 'improving' | 'stable' | 'worsening' | 'first_session',
    hoursAgo: number
  ): CNNOutputTool => ({
    sessionId,
    patientId,
    capturedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
    modelId: 'lung_cnn_v1',
    modelVersion: '1.0.0',
    signalSource: 'wearable',
    classProbabilities: {
      Bronchiectasis: 0.02,
      Bronchiolitis: 0.03,
      COPD: 0.1,
      Healthy: 1 - pneumoniaProb - 0.2,
      Pneumonia: pneumoniaProb,
      URTI: 0.05,
    },
    pneumoniaRiskBucket: risk,
    confidence: 0.78 + Math.random() * 0.15,
    trend,
    signalQuality: {
      qualityScore: 0.82,
      noiseFloorDb: -44,
      clippingRatio: 0.01,
      durationSec: 18,
    },
    guardrails: {
      requiresRepeatRecording: false,
      requiresDoctorEscalation: risk === 'high',
      escalationReason: risk === 'high'
        ? `Pneumonia probability ${(pneumoniaProb * 100).toFixed(0)}% exceeds threshold`
        : undefined,
    },
  });

  const demoSessions: ScreeningSession[] = [
    {
      id: 's1',
      patientId: 'p1',
      ashaWorkerId: workerId,
      startedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 2 * 3600000 + 120000).toISOString(),
      signalSource: 'wearable',
      cnnOutput: makeCnn('s1', 'p1', 0.72, 'high', 'first_session', 2),
      symptoms: ['Fast breathing', 'Fever'],
      notes: 'Pediatric patient, appears unwell',
      gpsLat: 24.832,
      gpsLon: 79.919,
    },
    {
      id: 's2',
      patientId: 'p2',
      ashaWorkerId: workerId,
      startedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 5 * 3600000 + 90000).toISOString(),
      signalSource: 'dual_fused',
      cnnOutput: makeCnn('s2', 'p2', 0.45, 'medium', 'worsening', 5),
      symptoms: ['Chronic cough', 'Wheezing'],
      notes: 'COPD patient, symptoms worsening',
      gpsLat: 24.833,
      gpsLon: 79.920,
    },
    {
      id: 's3',
      patientId: 'p3',
      ashaWorkerId: workerId,
      startedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 24 * 3600000 + 100000).toISOString(),
      signalSource: 'wearable',
      cnnOutput: makeCnn('s3', 'p3', 0.08, 'low', 'first_session', 24),
      symptoms: [],
      notes: 'Routine screening, healthy',
      gpsLat: 24.834,
      gpsLon: 79.921,
    },
    {
      id: 's4',
      patientId: 'p4',
      ashaWorkerId: workerId,
      startedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 1 * 3600000 + 110000).toISOString(),
      signalSource: 'phone_mic',
      cnnOutput: makeCnn('s4', 'p4', 0.68, 'high', 'worsening', 1),
      symptoms: ['Cough', 'Fever', 'Chest pain'],
      notes: 'Needs urgent referral',
      gpsLat: 24.831,
      gpsLon: 79.918,
    },
    {
      id: 's5',
      patientId: 'p5',
      ashaWorkerId: workerId,
      startedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 3 * 3600000 + 80000).toISOString(),
      signalSource: 'wearable',
      cnnOutput: makeCnn('s5', 'p5', 0.65, 'high', 'first_session', 3),
      symptoms: ['Fast breathing', 'Difficulty feeding'],
      notes: 'Infant, high risk',
      gpsLat: 24.832,
      gpsLon: 79.919,
    },
  ];

  demoSessions.forEach((s) => patients.addSession(s));

  const alert: OutbreakAlert = {
    id: 'outbreak-demo-001',
    detectedAt: new Date(Date.now() - 30 * 60000).toISOString(),
    centerLat: 24.832,
    centerLon: 79.919,
    radiusKm: 2,
    caseCount: 3,
    sessionIds: ['s1', 's4', 's5'],
    acknowledged: false,
  };
  outbreaks.addAlert(alert);
}
