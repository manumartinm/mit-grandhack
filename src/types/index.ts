// Risk levels
export type RiskBucket = 'low' | 'medium' | 'high';
export type Trend = 'improving' | 'stable' | 'worsening' | 'first_session';
export type SignalSource = 'wearable' | 'phone_mic' | 'dual_fused';
export type ReferralStatus = 'recommended' | 'accepted' | 'completed' | 'declined';

// Patient EMR
export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  weight?: number; // kg, important for pediatric
  village: string;
  ashaWorkerId: string;
  comorbidities: string[];
  vaccinations: string[];
  medications: string[];
  allergies: string[];
  priorDiagnoses: string[];
  createdAt: string; // ISO-8601
  updatedAt: string;
}

// Signal quality from audio capture
export interface SignalQuality {
  qualityScore: number; // 0..1
  noiseFloorDb: number;
  clippingRatio: number; // 0..1
  durationSec: number;
}

// CNN model output used as AI tool context
export interface CNNOutputTool {
  sessionId: string;
  patientId: string;
  capturedAt: string; // ISO-8601
  modelId: string;
  modelVersion: string;
  signalSource: SignalSource;
  classProbabilities: Record<string, number>;
  pneumoniaRiskBucket: RiskBucket;
  confidence: number; // 0..1
  trend: Trend;
  signalQuality: SignalQuality;
  guardrails: {
    requiresRepeatRecording: boolean;
    requiresDoctorEscalation: boolean;
    escalationReason?: string;
  };
}

// Recent sound record (lightweight for AI context)
export interface RecentSoundRecord {
  sessionId: string;
  deviceId: string;
  createdAt: string;
  durationSec: number;
  qualityScore: number;
  topLabel: string;
  pneumoniaRiskBucket: RiskBucket;
  doctorEscalationRecommended: boolean;
}

// Screening session (full record)
export interface ScreeningSession {
  id: string;
  patientId: string;
  ashaWorkerId: string;
  startedAt: string;
  completedAt?: string;
  signalSource: SignalSource;
  audioUri?: string;
  cnnOutput?: CNNOutputTool;
  symptoms: string[];
  notes: string;
  referralStatus?: ReferralStatus;
  referralTimestamp?: string;
  gpsLat?: number;
  gpsLon?: number;
}

// Outbreak alert
export interface OutbreakAlert {
  id: string;
  detectedAt: string;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  caseCount: number;
  sessionIds: string[];
  acknowledged: boolean;
}

// ASHA worker profile
export interface AshaWorker {
  id: string;
  name: string;
  phone: string;
  village: string;
  district: string;
  state: string;
  language: 'en' | 'hi';
}

// BLE device state
export type BleConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'streaming';

export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
  connectionState: BleConnectionState;
}

// AI assistant message
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  cnnToolUsed?: boolean;
}

// Telemedicine referral packet for eSanjeevani
export interface ReferralPacket {
  patientSummary: {
    name: string;
    age: number;
    sex: string;
    comorbidities: string[];
    medications: string[];
  };
  latestCnnResult: CNNOutputTool;
  recentSessions: RecentSoundRecord[];
  symptomTimeline: string[];
  aiConversationSummary: string;
  urgencyLevel: RiskBucket;
}
