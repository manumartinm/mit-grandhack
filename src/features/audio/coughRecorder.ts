import type { SignalQuality } from '../../types';
import { logger } from '../../utils/logger';

class CoughRecorder {
  private recording: any = null;
  private recordingUri: string | null = null;

  async startRecording(): Promise<void> {
    try {
      const { Audio } = require('expo-av');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      this.recording = recording;
    } catch (error) {
      logger.warn('Audio recording not available', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async stopRecording(): Promise<string | null> {
    if (!this.recording) return null;
    try {
      await this.recording.stopAndUnloadAsync();
      this.recordingUri = this.recording.getURI();
      this.recording = null;
      return this.recordingUri;
    } catch (error) {
      logger.warn('Stop recording error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  assessQuality(durationSec: number): SignalQuality {
    return {
      qualityScore: durationSec >= 3 ? 0.8 : 0.4,
      noiseFloorDb: -40,
      clippingRatio: 0.01,
      durationSec,
    };
  }
}

export const coughRecorder = new CoughRecorder();
