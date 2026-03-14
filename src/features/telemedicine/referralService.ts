import type { ReferralPacket, Patient, CNNOutputTool, RecentSoundRecord } from '../../types';

class ReferralService {
  buildReferralPacket(
    patient: Patient,
    latestResult: CNNOutputTool,
    recentSessions: RecentSoundRecord[],
    symptoms: string[],
    aiSummary: string
  ): ReferralPacket {
    return {
      patientSummary: {
        name: patient.name,
        age: patient.age,
        sex: patient.sex,
        comorbidities: patient.comorbidities,
        medications: patient.medications,
      },
      latestCnnResult: latestResult,
      recentSessions,
      symptomTimeline: symptoms,
      aiConversationSummary: aiSummary,
      urgencyLevel: latestResult.pneumoniaRiskBucket,
    };
  }

  async submitToESanjeevani(packet: ReferralPacket): Promise<{ success: boolean; referralId: string }> {
    await new Promise((r) => setTimeout(r, 1500));

    return {
      success: true,
      referralId: `ESANJ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    };
  }

}

export const referralService = new ReferralService();
