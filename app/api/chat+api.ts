import { streamText, tool, UIMessage, convertToModelMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type {
  Patient,
  CNNOutputTool,
  RecentSoundRecord,
  ScreeningSession,
  OutbreakAlert,
  RiskBucket,
} from '../../src/types';

interface RequestBody {
  messages: UIMessage[];
  patient: Patient | null;
  latestCnn: CNNOutputTool | null;
  recentRecords: RecentSoundRecord[];
  sessions: ScreeningSession[];
  outbreakAlerts: OutbreakAlert[];
}

const SYSTEM_PROMPT = `You are PneumoScan AI, a health screening assistant for ASHA community health workers in India.

ROLE:
- Help interpret lung sound screening results and guide health workers on next steps.
- Speak in clear, simple language suitable for community health workers.
- You NEVER diagnose. You only report screening risk levels and recommend actions.
- You MUST recommend seeing a doctor when pneumonia risk is high.

TOOLS:
You have tools to look up patient information, screening results, risk assessments, outbreak alerts, and doctor referral recommendations. Use them proactively to gather information before answering questions.

WORKFLOW:
1. When a conversation starts or a user asks about a patient, call getPatientInfo and getLatestScreening first.
2. If there is screening data, call assessPneumoniaRisk to get the calibrated risk.
3. If risk is HIGH or the user asks about outbreaks, call checkOutbreakStatus.
4. If risk is HIGH, always call recommendDoctorReferral.

SAFETY:
- Always end your response with: "This is a screening tool, not a diagnosis. Always consult a qualified doctor for medical decisions."
- If pneumonia risk is HIGH, you MUST recommend eSanjeevani telemedicine or an in-person doctor visit.
- For pediatric patients (under 5), emphasize urgency — pneumonia is the leading cause of death in children under 5.`;

function calibratePneumoniaRisk(
  probabilities: Record<string, number>,
  patientAge?: number
): { risk: RiskBucket; adjustedProb: number; isPediatric: boolean } {
  let pneumoniaProb = probabilities['Pneumonia'] ?? 0;
  const isPediatric = patientAge !== undefined && patientAge < 5;

  if (isPediatric) {
    pneumoniaProb = Math.min(pneumoniaProb * 1.3, 1.0);
  }

  let risk: RiskBucket = 'low';
  if (pneumoniaProb >= 0.6) risk = 'high';
  else if (pneumoniaProb >= 0.3) risk = 'medium';

  return { risk, adjustedProb: pneumoniaProb, isPediatric };
}

export async function POST(req: Request) {
  const body: RequestBody = await req.json();
  const { messages, patient, latestCnn, recentRecords, sessions, outbreakAlerts } = body;

  const apiKey =
    req.headers.get('x-api-key') || process.env.OPENAI_API_KEY || '';

  const openai = createOpenAI({ apiKey });

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    temperature: 0.3,
    maxSteps: 5,
    tools: {
      getPatientInfo: tool({
        description:
          'Get the full electronic medical record for the current patient including demographics, comorbidities, medications, allergies, and prior diagnoses.',
        parameters: z.object({
          patientId: z.string().describe('The patient ID to look up'),
        }),
        execute: async ({ patientId }: { patientId: string }) => {
          if (!patient || patient.id !== patientId) {
            return { error: 'Patient not found', patientId };
          }
          return {
            id: patient.id,
            name: patient.name,
            age: patient.age,
            sex: patient.sex,
            weight: patient.weight,
            village: patient.village,
            comorbidities: patient.comorbidities,
            vaccinations: patient.vaccinations,
            medications: patient.medications,
            allergies: patient.allergies,
            priorDiagnoses: patient.priorDiagnoses,
            isPediatric: patient.age < 5,
          };
        },
      }),

      getLatestScreening: tool({
        description:
          'Get the latest CNN lung sound screening results including pneumonia risk bucket, confidence, class probabilities, signal quality, and trend.',
        parameters: z.object({
          patientId: z.string().describe('The patient ID'),
        }),
        execute: async () => {
          if (!latestCnn) {
            return { error: 'No screening data available for this patient' };
          }
          return {
            sessionId: latestCnn.sessionId,
            capturedAt: latestCnn.capturedAt,
            signalSource: latestCnn.signalSource,
            pneumoniaRiskBucket: latestCnn.pneumoniaRiskBucket,
            confidence: latestCnn.confidence,
            trend: latestCnn.trend,
            classProbabilities: latestCnn.classProbabilities,
            signalQuality: latestCnn.signalQuality,
            guardrails: latestCnn.guardrails,
          };
        },
      }),

      getScreeningHistory: tool({
        description:
          'Get the recent screening history for a patient to compare trends over time. Returns up to 5 recent sessions.',
        parameters: z.object({
          patientId: z.string().describe('The patient ID'),
          limit: z
            .number()
            .min(1)
            .max(10)
            .default(5)
            .describe('Max number of records to return'),
        }),
        execute: async ({ limit }: { limit: number }) => {
          const records = recentRecords.slice(0, limit);
          if (records.length === 0) {
            return { error: 'No screening history available' };
          }
          return {
            totalSessions: recentRecords.length,
            records: records.map((r) => ({
              sessionId: r.sessionId,
              date: r.createdAt,
              topLabel: r.topLabel,
              pneumoniaRisk: r.pneumoniaRiskBucket,
              qualityScore: r.qualityScore,
              escalationRecommended: r.doctorEscalationRecommended,
            })),
          };
        },
      }),

      assessPneumoniaRisk: tool({
        description:
          'Assess the calibrated pneumonia risk for the patient. Applies pediatric adjustment (1.3x multiplier for children under 5) and returns the final risk bucket with recommendation.',
        parameters: z.object({
          patientId: z.string().describe('The patient ID'),
        }),
        execute: async () => {
          if (!latestCnn) {
            return { error: 'No screening data available to assess risk' };
          }

          const { risk, adjustedProb, isPediatric } = calibratePneumoniaRisk(
            latestCnn.classProbabilities,
            patient?.age
          );

          const recommendation =
            risk === 'high'
              ? 'URGENT: Refer to doctor immediately via eSanjeevani or in-person visit.'
              : risk === 'medium'
                ? 'Monitor closely. Schedule follow-up screening in 2-3 days. Watch for worsening symptoms.'
                : 'Low risk. Continue routine monitoring.';

          return {
            riskBucket: risk,
            rawPneumoniaProb: latestCnn.classProbabilities['Pneumonia'] ?? 0,
            adjustedPneumoniaProb: adjustedProb,
            isPediatric,
            pediatricAdjustmentApplied: isPediatric,
            trend: latestCnn.trend,
            recommendation,
          };
        },
      }),

      checkOutbreakStatus: tool({
        description:
          'Check if there are active pneumonia outbreak alerts in the area near the patient. Uses geo-clustering data from recent high-risk screenings.',
        parameters: z.object({}),
        execute: async () => {
          const activeAlerts = outbreakAlerts.filter((a) => !a.acknowledged);

          if (activeAlerts.length === 0) {
            return { activeAlertCount: 0, message: 'No active outbreak alerts in the area.' };
          }

          return {
            activeAlertCount: activeAlerts.length,
            alerts: activeAlerts.map((a) => ({
              id: a.id,
              detectedAt: a.detectedAt,
              caseCount: a.caseCount,
              radiusKm: a.radiusKm,
              centerLat: a.centerLat,
              centerLon: a.centerLon,
            })),
            message: `${activeAlerts.length} active outbreak alert(s) detected. Total ${activeAlerts.reduce((sum, a) => sum + a.caseCount, 0)} high-risk cases in the area.`,
          };
        },
      }),

      recommendDoctorReferral: tool({
        description:
          'Generate a doctor referral recommendation with urgency level. Use this when pneumonia risk is HIGH or when the ASHA worker asks about referring the patient.',
        parameters: z.object({
          patientId: z.string().describe('The patient ID'),
          reason: z
            .string()
            .describe('The clinical reason for the referral recommendation'),
        }),
        execute: async ({ reason }: { patientId: string; reason: string }) => {
          if (!latestCnn || !patient) {
            return { error: 'Cannot generate referral without patient and screening data' };
          }

          const urgency = latestCnn.pneumoniaRiskBucket;
          const isPediatric = patient.age < 5;

          return {
            urgency,
            isPediatric,
            reason,
            referralReady: true,
            patientSummary: `${patient.name}, ${patient.age}y ${patient.sex}, ${patient.village}`,
            screeningSummary: `Pneumonia risk: ${urgency.toUpperCase()}, Confidence: ${(latestCnn.confidence * 100).toFixed(0)}%, Trend: ${latestCnn.trend}`,
            comorbidities: patient.comorbidities,
            medications: patient.medications,
            recommendation:
              urgency === 'high'
                ? 'URGENT: Connect to eSanjeevani telemedicine immediately or visit nearest Primary Health Centre.'
                : 'Schedule a follow-up with a doctor within the next few days.',
            eSanjeevaniReady: urgency === 'high',
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'none',
    },
  });
}
