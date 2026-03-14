import type { BleDevice, BleConnectionState } from '../../types';

const PNEUMOSCAN_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const AUDIO_CHAR_UUID = '12345678-1234-1234-1234-123456789abd';
const CONTROL_CHAR_UUID = '12345678-1234-1234-1234-123456789abe';

type AudioChunkCallback = (chunk: number[]) => void;

class BleService {
  private manager: any = null;
  private device: any = null;
  private onAudioChunk: AudioChunkCallback | null = null;
  private _connectionState: BleConnectionState = 'disconnected';

  get connectionState(): BleConnectionState {
    return this._connectionState;
  }

  async initialize(): Promise<void> {
    try {
      const { BleManager } = require('react-native-ble-plx');
      this.manager = new BleManager();
    } catch {
      console.warn('BLE not available — running in mock mode');
    }
  }

  async startScan(onDeviceFound: (device: BleDevice) => void): Promise<void> {
    this._connectionState = 'scanning';

    if (!this.manager) {
      setTimeout(() => {
        onDeviceFound({
          id: 'mock-esp32-001',
          name: 'PneumoScan ESP32',
          rssi: -55,
          connectionState: 'disconnected',
        });
      }, 1500);
      return;
    }

    this.manager.startDeviceScan(
      [PNEUMOSCAN_SERVICE_UUID],
      null,
      (error: any, device: any) => {
        if (error) {
          console.error('BLE scan error:', error);
          return;
        }
        if (device) {
          onDeviceFound({
            id: device.id,
            name: device.name ?? 'Unknown Device',
            rssi: device.rssi ?? -100,
            connectionState: 'disconnected',
          });
        }
      }
    );
  }

  stopScan(): void {
    this.manager?.stopDeviceScan();
  }

  async connect(deviceId: string): Promise<boolean> {
    this._connectionState = 'connecting';

    if (!this.manager) {
      await new Promise((r) => setTimeout(r, 1000));
      this._connectionState = 'connected';
      return true;
    }

    try {
      this.device = await this.manager.connectToDevice(deviceId);
      await this.device.discoverAllServicesAndCharacteristics();
      this._connectionState = 'connected';
      return true;
    } catch (error) {
      console.error('BLE connect error:', error);
      this._connectionState = 'disconnected';
      return false;
    }
  }

  async startStreaming(onChunk: AudioChunkCallback): Promise<void> {
    this._connectionState = 'streaming';
    this.onAudioChunk = onChunk;

    if (!this.device) {
      this.startMockStreaming(onChunk);
      return;
    }

    this.device.monitorCharacteristicForService(
      PNEUMOSCAN_SERVICE_UUID,
      AUDIO_CHAR_UUID,
      (error: any, characteristic: any) => {
        if (error) {
          console.error('BLE stream error:', error);
          return;
        }
        if (characteristic?.value) {
          const raw = atob(characteristic.value);
          const chunk = Array.from(raw).map((c) => c.charCodeAt(0));
          onChunk(chunk);
        }
      }
    );
  }

  private mockInterval: ReturnType<typeof setInterval> | null = null;

  private startMockStreaming(onChunk: AudioChunkCallback): void {
    let t = 0;
    this.mockInterval = setInterval(() => {
      const chunk: number[] = [];
      for (let i = 0; i < 160; i++) {
        const breath = Math.sin(t * 0.02) * 0.3;
        const crackle = Math.random() > 0.95 ? (Math.random() - 0.5) * 0.8 : 0;
        const noise = (Math.random() - 0.5) * 0.05;
        chunk.push(Math.round((breath + crackle + noise) * 127 + 128));
        t++;
      }
      onChunk(chunk);
    }, 20);
  }

  async stopStreaming(): Promise<void> {
    this._connectionState = 'connected';
    this.onAudioChunk = null;
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  async disconnect(): Promise<void> {
    await this.stopStreaming();
    if (this.device) {
      await this.manager?.cancelDeviceConnection(this.device.id);
      this.device = null;
    }
    this._connectionState = 'disconnected';
  }
}

export const bleService = new BleService();
