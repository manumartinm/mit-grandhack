# PneumoScan

Portable lung screening for every village. Built for India's 1M+ ASHA community health workers.

**MIT Grand Hack 2026 — Portable Health + Virtual Diagnostic Interfaces**

## Quick Start

```bash
cd pneumoscan
npm install
npx expo start
```

Scan the QR code with Expo Go (or press `a` for Android / `i` for iOS simulator).

## Architecture

- **Expo React Native** with file-based routing (`expo-router`)
- **BLE audio pipeline** from ESP32 wearable stethoscope (mock mode included)
- **Phone mic fallback** for cough recording and chest placement
- **On-device CNN inference** with TFLite/ONNX model contract
- **Dual-signal fusion** weighted ensemble (70% auscultation / 30% cough)
- **AI health assistant** with CNN output as structured tool, safety guardrails
- **DBSCAN outbreak detector** for community pneumonia cluster alerts
- **eSanjeevani telemedicine** referral with clinical summary packet
- **Hindi + English** i18n from day one

## Project Structure

```
pneumoscan/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout
│   ├── index.tsx                 # ASHA worker login
│   ├── home.tsx                  # Dashboard with stats + alerts
│   ├── patients/
│   │   ├── index.tsx             # Patient roster with search/sort
│   │   ├── add.tsx               # Add patient + EMR form
│   │   └── detail.tsx            # Patient detail + history
│   ├── screening/
│   │   ├── index.tsx             # BLE connect → record → analyze
│   │   └── results.tsx           # Risk card + probabilities
│   ├── ai-assistant.tsx          # AI chat with voice + guardrails
│   ├── telemedicine.tsx          # eSanjeevani referral
│   └── outbreak.tsx              # Community outbreak alerts
├── src/
│   ├── components/               # Card, Button, RiskBadge, etc.
│   ├── features/
│   │   ├── ai/                   # AI service + guardrails
│   │   ├── audio/                # Cough recorder + dual-signal fusion
│   │   ├── ble/                  # BLE service for ESP32
│   │   ├── inference/            # Model runner + calibration
│   │   ├── outbreak/             # DBSCAN geo-clustering
│   │   └── telemedicine/         # eSanjeevani referral service
│   ├── i18n/                     # English + Hindi translations
│   ├── stores/                   # Zustand state management
│   ├── theme/                    # Colors, spacing, typography
│   ├── types/                    # TypeScript interfaces
│   └── utils/                    # Demo seed data
└── package.json
```

## Demo Flow (3 min)

1. App opens → ASHA worker dashboard with 5 patients, 3 high-risk, outbreak alert
2. Select patient → BLE connects → live waveform recording
3. Cough capture → dual-signal AI analysis → risk card
4. Hindi AI voice assistant explains results using CNN tool output
5. Outbreak badge lights up (3 high-risk in same village)
6. One-tap eSanjeevani referral with clinical summary

## Key Dependencies

| Package | Purpose |
|---------|---------|
| expo-router | File-based navigation |
| react-native-ble-plx | ESP32 BLE connection |
| expo-av | Cough recording |
| expo-location | GPS for outbreak clustering |
| expo-speech | Hindi TTS |
| zustand | State management |
| i18next | Hindi/English i18n |
| react-native-reanimated | Waveform animations |
| date-fns | Date formatting |

## Team

MIT Grand Hack 2026
