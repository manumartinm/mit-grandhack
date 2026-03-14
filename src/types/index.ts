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

export type MedicalRecordType =
  | "lab_result"
  | "prescription"
  | "diagnosis"
  | "imaging"
  | "other";

export interface MedicalRecord {
  id: number;
  patientId: number;
  recordType: MedicalRecordType;
  title: string;
  content: string;
  recordDate?: string;
  createdAt: string;
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
  zoneResults?: ZoneRecordingResult[];
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

export type LungZone =
  | "left_upper_front"
  | "right_upper_front"
  | "left_lower_back"
  | "right_lower_back";

export interface ZoneRecordingResult {
  zone: LungZone;
  qualityScore: number;
  durationSec: number;
  clippingRatio: number;
  noiseFloorDb: number;
  passed: boolean;
  reason?: string;
}

export type RecordingErrorCode =
  | "ble_disconnected"
  | "weak_signal"
  | "high_noise"
  | "audio_clipping"
  | "incomplete_capture";

export interface RecordingError {
  code: RecordingErrorCode;
  message: string;
  zone?: LungZone;
  recoverable: boolean;
}

export interface UserProfile {
  phone?: string;
  preferredLanguage?: "en" | "hi";
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  clinicName?: string;
}

export interface DoctorProfile {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  online: boolean;
}

export interface DoctorMessage {
  id: string;
  role: "patient" | "doctor" | "system";
  content: string;
  timestamp: string;
}

export interface DoctorThread {
  id: string;
  doctorId: string;
  patientId: string;
  messages: DoctorMessage[];
}

// Nurse note — can optionally be linked to a screening session or a medical record
export interface PatientNote {
  id: string;
  text: string;
  createdAt: string; // ISO-8601
  linkedSessionId?: string;
  linkedRecordId?: number;
}

export type CallMode = "dialer_now" | "in_app_later";
export type CallStatus =
  | "idle"
  | "requesting"
  | "ringing"
  | "connected"
  | "ended"
  | "pending"
  | "accepted"
  | "cancelled";

export interface CallSession {
  id: string;
  doctorId: string;
  patientId: string;
  mode: CallMode;
  status: CallStatus;
  createdAt: string;
}
