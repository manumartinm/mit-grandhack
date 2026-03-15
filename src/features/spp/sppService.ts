import { PermissionsAndroid, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Audio } from 'expo-av';

// ─── Audio format constants ───────────────────────────────────────────────────
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const BYTE_RATE = SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8); // 32000
const BLOCK_ALIGN = CHANNELS * (BIT_DEPTH / 8);             // 2

// ─── Connection constants ─────────────────────────────────────────────────────
const DEVICE_NAME = 'ESP32_MIC';
const DEVICE_MAC = '4C:C3:82:C4:7D:E2';
const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB';
const DISCOVERY_TIMEOUT_MS = 12000;

// ─── Types ────────────────────────────────────────────────────────────────────
export type SppConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'recording'
  | 'receiving'
  | 'complete'
  | 'error';

type ParserState = 'WAIT_TEXT' | 'READ_SIZE' | 'READ_PCM' | 'WAIT_END';

export interface SppDevice {
  id: string;
  name: string;
  address: string;
  bonded: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class SppService {
  // ── Connection ──────────────────────────────────────────────────────────────
  private connectionState: SppConnectionState = 'idle';
  private connectedDevice: any = null;
  private dataSubscription: any = null;

  // ── Binary protocol parser ───────────────────────────────────────────────────
  private parserState: ParserState = 'WAIT_TEXT';
  private byteBuffer: number[] = [];
  private pcmSize = 0;
  private pcmReceived = 0;
  private pcmBuffer: number[] = [];

  // ── Zone recording timeout ────────────────────────────────────────────────────
  private zoneTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private static readonly ZONE_TIMEOUT_MS = 30_000;

  // ── Callbacks ─────────────────────────────────────────────────────────────────
  onStateChange?: (state: SppConnectionState) => void;
  onStatusMessage?: (msg: string) => void;
  onProgress?: (current: number, total: number) => void;
  onAudioReady?: (uri: string) => void;
  /** Fires with uint8-normalised samples (0-255) ready for quality evaluation */
  onZoneSamplesReady?: (samples: number[]) => void;
  onError?: (error: string) => void;

  // ── Helpers ───────────────────────────────────────────────────────────────────
  private setState(state: SppConnectionState) {
    this.connectionState = state;
    this.onStateChange?.(state);
  }

  getConnectionState(): SppConnectionState {
    return this.connectionState;
  }

  private async ensureBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const sdk = Number(Platform.Version);
      if (sdk >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }

      const loc = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return loc === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e: any) {
      this.onError?.(e?.message ?? 'Failed to request Bluetooth permissions');
      return false;
    }
  }

  private resetParser() {
    this.parserState = 'WAIT_TEXT';
    this.byteBuffer = [];
    this.pcmSize = 0;
    this.pcmReceived = 0;
    this.pcmBuffer = [];
  }

  // ── Scan ──────────────────────────────────────────────────────────────────────
  async scan(): Promise<SppDevice[]> {
    if (Platform.OS !== 'android') {
      this.onError?.('Bluetooth Classic SPP is only supported on Android.');
      return [];
    }

    this.setState('scanning');
    try {
      const hasPerms = await this.ensureBluetoothPermissions();
      if (!hasPerms) {
        this.setState('error');
        this.onError?.(
          'Bluetooth permissions are required. Please allow Nearby Devices and Bluetooth permissions.'
        );
        return [];
      }

      // Lazy-import to avoid loading on iOS
      const RNBtClassic = require('react-native-bluetooth-classic').default;

      const isEnabled: boolean = await RNBtClassic.isBluetoothEnabled();
      if (!isEnabled) {
        await RNBtClassic.requestBluetoothEnabled();
      }

      // 1. Check already-bonded devices first — instant, no radio scan needed
      const bonded: any[] = await RNBtClassic.getBondedDevices();
      const esp32Bonded = bonded.filter((d: any) => {
        const name = String(d.name ?? '').trim();
        const address = String(d.address ?? '').toUpperCase();
        return name === DEVICE_NAME || address === DEVICE_MAC;
      });
      if (esp32Bonded.length > 0) {
        this.setState('idle');
        return esp32Bonded.map((d: any) => ({
          id: d.address,
          name: d.name ?? DEVICE_NAME,
          address: d.address,
          bonded: true,
        }));
      }

      // 2. Fall back to active discovery (requires discoverable mode on ESP32)
      const found: SppDevice[] = [];
      const sub = RNBtClassic.onDeviceDiscovered((device: any) => {
        const name = String(device.name ?? '').trim();
        const address = String(device.address ?? '').toUpperCase();
        if (name === DEVICE_NAME || address === DEVICE_MAC) {
          found.push({
            id: device.address,
            name: device.name ?? DEVICE_NAME,
            address: device.address,
            bonded: false,
          });
        }
      });

      await RNBtClassic.startDiscovery();
      await new Promise<void>((resolve) => setTimeout(resolve, DISCOVERY_TIMEOUT_MS));
      await RNBtClassic.cancelDiscovery();
      sub.remove();

      this.setState('idle');
      return found;
    } catch (e: any) {
      this.setState('error');
      this.onError?.(e?.message ?? 'Scan failed');
      return [];
    }
  }

  // ── Connect ───────────────────────────────────────────────────────────────────
  async connect(deviceId: string): Promise<void> {
    this.setState('connecting');
    try {
      const hasPerms = await this.ensureBluetoothPermissions();
      if (!hasPerms) {
        this.setState('error');
        this.onError?.(
          'Bluetooth permissions are required. Please allow Nearby Devices and Bluetooth permissions.'
        );
        throw new Error('Bluetooth permissions denied');
      }

      const RNBtClassic = require('react-native-bluetooth-classic').default;

      // ISO-8859-1 (Latin-1) maps bytes 0x00–0xFF losslessly — required for PCM
      const device = await RNBtClassic.connectToDevice(deviceId, {
        delimiter: '',
        charset: 'ISO-8859-1',
        uuid: SPP_UUID,
      });

      this.connectedDevice = device;
      this.resetParser();

      // Subscribe to incoming byte stream
      this.dataSubscription = device.onDataReceived(({ data }: { data: string }) => {
        // Convert Latin-1 string to Uint8Array without any Node Buffer dependency
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          bytes[i] = data.charCodeAt(i) & 0xff;
        }
        this.processBuffer(bytes);
      });

      this.setState('connected');
    } catch (e: any) {
      this.setState('error');
      this.onError?.(e?.message ?? 'Connection failed');
      throw e;
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────────
  async disconnect(): Promise<void> {
    this.clearZoneTimeout();
    this.dataSubscription?.remove();
    this.dataSubscription = null;
    try {
      await this.connectedDevice?.disconnect();
    } catch {}
    this.connectedDevice = null;
    this.resetParser();
    this.setState('idle');
  }

  // ── Send Record command ───────────────────────────────────────────────────────
  async sendRecord(): Promise<void> {
    if (!this.connectedDevice) {
      this.onError?.('Not connected to ESP32');
      return;
    }
    if (this.connectionState === 'recording' || this.connectionState === 'receiving') {
      this.onStatusMessage?.("[WARN] Ignored: device is busy recording/transferring.");
      return;
    }
    try {
      // Write the ASCII byte 'R' (0x52).  The ESP32 scans for this byte regardless
      // of whether a \r\n follows, so plain 'R' is sufficient.
      await this.connectedDevice.write('R');
      // Transition immediately so the UI shows "recording" before the first [REC] message
      this.setState('recording');
      // Start zone-level safety timeout — if no AUDIO_END arrives within 30s, report error
      this.clearZoneTimeout();
      this.zoneTimeoutId = setTimeout(() => {
        this.zoneTimeoutId = null;
        this.onError?.('Recording timeout — no audio received from ESP32 within 30 seconds.');
        if (
          this.connectionState === 'recording' ||
          this.connectionState === 'receiving'
        ) {
          this.setState('connected'); // allow retry
        }
      }, SppService.ZONE_TIMEOUT_MS);
    } catch (e: any) {
      this.onError?.(e?.message ?? 'Failed to send record command');
    }
  }

  private clearZoneTimeout(): void {
    if (this.zoneTimeoutId !== null) {
      clearTimeout(this.zoneTimeoutId);
      this.zoneTimeoutId = null;
    }
  }

  // ── Binary protocol parser ────────────────────────────────────────────────────
  //
  // Stream structure (per spec):
  //   PHASE 1  text lines \r\n  (status messages)
  //   PHASE 2  "AUDIO_START\n" (12 bytes, LF-only) + 4-byte uint32 LE (PCM size)
  //   PHASE 3  N bytes raw PCM (int16 LE mono 16kHz)
  //   PHASE 4  "AUDIO_END\n"  (10 bytes, LF-only)
  //   PHASE 5  text lines \r\n (OK messages)
  //
  // CRITICAL: text lines use \r\n but the audio markers use bare \n.
  // We split on 0x0A and strip trailing 0x0D before comparing.
  private processBuffer(incoming: Uint8Array) {
    for (let i = 0; i < incoming.length; i++) {
      this.byteBuffer.push(incoming[i]);
    }

    let progress = true;
    while (progress) {
      progress = false;

      // ── WAIT_TEXT: scan for \n, extract line, check for markers ─────────────
      if (this.parserState === 'WAIT_TEXT') {
        const nlIdx = this.byteBuffer.indexOf(0x0a);
        if (nlIdx >= 0) {
          // Extract bytes up to and including \n
          const lineBytes = this.byteBuffer.splice(0, nlIdx + 1);
          // Build string, skip trailing \n and optional \r
          let line = '';
          for (let i = 0; i < lineBytes.length - 1; i++) {
            if (lineBytes[i] !== 0x0d) line += String.fromCharCode(lineBytes[i]);
          }

          if (line === 'AUDIO_START') {
            this.parserState = 'READ_SIZE';
            this.pcmBuffer = [];
            this.pcmReceived = 0;
            this.setState('receiving');
          } else if (line.length > 0) {
            this.onStatusMessage?.(line);
            // Parse [REC] n/total progress messages
            const m = line.match(/\[REC\] (\d+)\/(\d+)/);
            if (m) {
              this.setState('recording');
              this.onProgress?.(parseInt(m[1], 10), parseInt(m[2], 10));
            }
          }
          progress = true;
        }
      }

      // ── READ_SIZE: wait for 4-byte uint32 LE → pcmSize ─────────────────────
      else if (this.parserState === 'READ_SIZE') {
        if (this.byteBuffer.length >= 4) {
          const b = this.byteBuffer.splice(0, 4);
          this.pcmSize = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
          this.parserState = 'READ_PCM';
          progress = true;
        }
      }

      // ── READ_PCM: accumulate exactly pcmSize bytes ──────────────────────────
      else if (this.parserState === 'READ_PCM') {
        const needed = this.pcmSize - this.pcmReceived;
        const take = Math.min(needed, this.byteBuffer.length);
        if (take > 0) {
          const chunk = this.byteBuffer.splice(0, take);
          for (const b of chunk) this.pcmBuffer.push(b);
          this.pcmReceived += take;
          progress = true;
          if (this.pcmReceived >= this.pcmSize) {
            this.parserState = 'WAIT_END';
          }
        }
      }

      // ── WAIT_END: scan for "AUDIO_END\n", then build WAV ───────────────────
      else if (this.parserState === 'WAIT_END') {
        const nlIdx = this.byteBuffer.indexOf(0x0a);
        if (nlIdx >= 0) {
          const lineBytes = this.byteBuffer.splice(0, nlIdx + 1);
          let line = '';
          for (let i = 0; i < lineBytes.length - 1; i++) {
            if (lineBytes[i] !== 0x0d) line += String.fromCharCode(lineBytes[i]);
          }
          if (line === 'AUDIO_END') {
            this.parserState = 'WAIT_TEXT';
            this.buildAndSaveWav();
          }
          progress = true;
        }
      }
    }
  }

  // ── Build WAV file, emit normalised samples, and play ────────────────────────
  private async buildAndSaveWav() {
    this.clearZoneTimeout();
    try {
      const pcm = new Uint8Array(this.pcmBuffer);

      // ── Normalise int16 LE → uint8 (0-255) for the screening quality evaluator ──
      // The ESP32 sends signed 16-bit little-endian PCM.  We create an Int16Array
      // view over the same buffer (no copy) and map each sample to the 0-255 range
      // centred at 128, matching the format expected by evaluateZoneQuality().
      const int16View = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
      const uint8Samples = new Array<number>(int16View.length);
      for (let i = 0; i < int16View.length; i++) {
        uint8Samples[i] = Math.min(
          255,
          Math.max(0, Math.round(((int16View[i] + 32768) / 65535) * 255))
        );
      }
      this.onZoneSamplesReady?.(uint8Samples);

      // ── Write WAV to cache ────────────────────────────────────────────────────
      const wav = this.buildWavBuffer(pcm);
      const file = new File(Paths.cache, 'esp32_rec.wav');
      const writer = file.writableStream().getWriter();
      await writer.write(wav);
      await writer.close();

      this.onAudioReady?.(file.uri);
      this.setState('complete');

      // Auto-play
      await this.playAudio(file.uri);
    } catch (e: any) {
      this.onError?.(e?.message ?? 'Failed to build WAV');
    }
  }

  // ── 44-byte WAV header (RIFF/PCM, per spec) ───────────────────────────────────
  private buildWavBuffer(pcm: Uint8Array): Uint8Array {
    const dataSize = pcm.length;
    const fileSize = dataSize + 36; // RIFF size field = total - 8 + 8 = total - 8... = data + 36

    const header = new Uint8Array(44);
    const v = new DataView(header.buffer);

    // RIFF chunk descriptor
    header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46; // "RIFF"
    v.setUint32(4, fileSize, true);
    header[8] = 0x57; header[9] = 0x41; header[10] = 0x56; header[11] = 0x45; // "WAVE"

    // fmt sub-chunk
    header[12] = 0x66; header[13] = 0x6d; header[14] = 0x74; header[15] = 0x20; // "fmt "
    v.setUint32(16, 16, true);            // PCM sub-chunk size = 16
    v.setUint16(20, 1, true);             // AudioFormat = PCM
    v.setUint16(22, CHANNELS, true);
    v.setUint32(24, SAMPLE_RATE, true);
    v.setUint32(28, BYTE_RATE, true);
    v.setUint16(32, BLOCK_ALIGN, true);
    v.setUint16(34, BIT_DEPTH, true);

    // data sub-chunk
    header[36] = 0x64; header[37] = 0x61; header[38] = 0x74; header[39] = 0x61; // "data"
    v.setUint32(40, dataSize, true);

    const result = new Uint8Array(44 + dataSize);
    result.set(header, 0);
    result.set(pcm, 44);
    return result;
  }

  // ── Playback (can be called externally to replay) ─────────────────────────────
  async playAudio(uri: string): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
      });
      const { sound } = await Audio.Sound.createAsync({ uri });
      await sound.playAsync();
      // Clean up after playback
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (e: any) {
      this.onError?.(e?.message ?? 'Playback failed');
    }
  }
}

export const sppService = new SppService();
