# PneumoScan (Sthetho Scan) — Architecture & How It Works

PneumoScan is a mobile-first clinical decision-support tool designed for community health workers (ASHA workers, field nurses, rural doctors) to screen patients for pneumonia and other respiratory conditions using lung sound recordings from a stethoscope or the device microphone.

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Frontend (React Native / Expo)](#frontend)
   - [Authentication](#authentication)
   - [Tab Navigation](#tab-navigation)
   - [Patient Management](#patient-management)
   - [Lung Screening Workflow](#lung-screening-workflow)
   - [Screening Results](#screening-results)
   - [AI Assistant](#ai-assistant)
   - [Dashboard & Outbreak Monitoring](#dashboard--outbreak-monitoring)
   - [Telemedicine & Doctor Referral](#telemedicine--doctor-referral)
4. [Backend (FastAPI / Python)](#backend)
   - [Audio Pipeline](#audio-pipeline)
   - [ML Inference](#ml-inference)
   - [REST API Routers](#rest-api-routers)
   - [Database](#database)
5. [Signal Processing & Fusion](#signal-processing--fusion)
6. [Triage Decision Engine](#triage-decision-engine)
7. [State Management (Providers)](#state-management-providers)
8. [Data Flow: End-to-End Screening](#data-flow-end-to-end-screening)

---

## Overview

The app bridges a gap in low-resource healthcare settings where trained radiologists and stethoscope-reading physicians may be unavailable. A community health worker can:

- Register patients and track their history
- Record lung sounds through a connected SPP (Serial Port Profile) Bluetooth wearable stethoscope **or** the phone's built-in microphone (cough recording)
- Send audio to a server running a TFLite CNN model for real-time respiratory classification
- Receive a risk-stratified result (Low / Medium / High) with AI-generated clinical insights
- Get flagged for outbreak clusters when multiple high-risk cases appear geographically close
- Escalate to a remote doctor via a telemedicine referral or live call

---

## System Architecture

```
┌────────────────────────────────────────────┐
│           Mobile App (Expo / RN)           │
│  ┌──────────────┐  ┌─────────────────────┐ │
│  │  UI Screens  │  │  React Context      │ │
│  │  (app/)      │  │  Providers (src/)   │ │
│  └──────┬───────┘  └──────────┬──────────┘ │
│         │                     │            │
│  ┌──────▼─────────────────────▼──────────┐ │
│  │  Feature Modules (src/features/)      │ │
│  │  audio · inference · telemedicine     │ │
│  └──────────────────┬────────────────────┘ │
└─────────────────────│──────────────────────┘
                      │ HTTP (REST / SSE)
┌─────────────────────▼──────────────────────┐
│           FastAPI Backend (server/)        │
│  ┌──────────────┐  ┌─────────────────────┐ │
│  │  /predict    │  │  /ai  /patients     │ │
│  │  /screenings │  │  /auth  /comms      │ │
│  └──────┬───────┘  └──────────┬──────────┘ │
│         │                     │            │
│  ┌──────▼───────┐  ┌──────────▼──────────┐ │
│  │  Audio DSP   │  │  SQLite (SQLAlchemy) │ │
│  │  TFLite CNN  │  │  OpenAI GPT-4o-mini │ │
│  └──────────────┘  └─────────────────────┘ │
└────────────────────────────────────────────┘
```

The backend is typically exposed to the mobile device via **ngrok** (or a local network URL configurable directly in the app's login screen).

---

## Frontend

The frontend is a **React Native** app built with **Expo Router** (file-based routing). All source lives under `pneumoscan/`.

### Authentication

**Screen:** `app/index.tsx`

The entry screen provides Login and Register tabs. On successful auth, the user is redirected to `/home`. A configurable API URL field (for ngrok) is hidden behind a toggle so health workers can point the app at whatever server is running.

- `AuthProvider` (`src/providers/AuthProvider.tsx`) holds the JWT token, manages `login`, `register`, and `fetchMe` calls, and persists the token via `AsyncStorage`.
- All authenticated API calls attach the bearer token as an `Authorization` header.

---

### Tab Navigation

**Layout:** `app/(tabs)/_layout.tsx`

Five main tabs are available after login:

| Tab | Route | Purpose |
|-----|-------|---------|
| Patients | `home` | Patient roster — search, add, select patients |
| New Visit | `new-visit` | Pick a patient and start a screening session |
| Dashboard | `dashboard` | Stats, priority follow-up list, outbreak summary |
| AI Chat | `ai-chat` | Chat with GPT-4o AI assistant about a patient |
| Doctor | `doctor-chat` | Coordinate with a remote doctor via chat or call |

The tab bar uses a frosted-glass blur overlay with a deep-blue tint.

---

### Patient Management

**Screens:** `app/patients/index.tsx`, `app/patients/add.tsx`, `app/patients/detail.tsx`

- Patient list is fetched from the backend (`GET /patients`) and cached in `PatientProvider`.
- Each patient has: name, age, sex, village, ASHA worker ID, weight, and optional notes.
- The detail screen shows all screening sessions with risk badges and a timeline.
- `PatientProvider` exposes helpers like `getHighRiskPatients()`, `getTodaySessionCount()`, and `getSessionsForPatient()`.

---

### Lung Screening Workflow

**Screen:** `app/screening/index.tsx`

This is the core clinical workflow. It walks the health worker through a sequence of steps:

```
connect → placement → recording → zone_feedback → cough → analyzing → done
```

#### Steps in detail

1. **connect** — The worker is prompted to connect a Bluetooth SPP wearable stethoscope (via `SppProvider`). The app can also fall back to phone microphone only.

2. **placement** — The app displays an anatomical body diagram (SVG front/back view) indicating exactly where to place the stethoscope for the current lung zone. Four zones are recorded in sequence:
   - Left upper front (under left collarbone)
   - Right upper front (under right collarbone)
   - Left lower back (near lower left ribs)
   - Right lower back (near lower right ribs)

3. **recording** — For each zone, audio is recorded. If a wearable is connected, it streams via the SPP Bluetooth service. Otherwise `coughRecorder` captures via the device microphone.

4. **zone_feedback** — Immediately after each recording, signal quality is shown (RMS level, clipping %, silence ratio, SNR). The worker can re-record if quality is poor.

5. **cough** — Optionally, a separate cough sample is captured from the phone mic for dual-signal fusion.

6. **analyzing** — Each zone recording (and the optional cough sample) is uploaded to the backend `/predict` endpoint. Results are fused via `dualSignalFusion`.

7. **done** — The session is stored and the user is navigated to the Results screen.

---

### Screening Results

**Screen:** `app/screening/results.tsx`

Displays a two-tab view:

- **Summary tab:** AI-generated triage insight (verdict, explanation, warning signs, recommended next actions), risk badge (Low / Medium / High), confidence score, signal source.
- **Technical tab:** Per-class probability bar chart for all 6 respiratory categories (Pneumonia, COPD, Bronchiectasis, Bronchiolitis, URTI, Healthy), per-zone waveform snapshots, signal quality metrics.

An AI insight is generated by calling the backend `POST /ai/screening-insights`, which uses GPT-4o-mini to translate raw model probabilities into plain-language guidance for the health worker.

From results, the worker can:
- Save and return home
- Open the telemedicine referral screen

---

### AI Assistant

**Screen:** `app/ai-assistant.tsx` (also accessible as the `ai-chat` tab)

A streaming chat interface backed by `POST /ai/chat` on the server. The AI assistant (`coordinator_agent` in `routers/ai.py`) is a **pydantic-ai** agent configured as "Sthetho Scan AI — a clinical decision-support assistant for lung screening."

The assistant has access to two tools:
- `get_patient_emr` — fetches the patient's full medical record history from the database
- `get_risk_context` — fetches CNN output and outbreak alert data for the patient

The patient context (CNN result, outbreak status) is automatically injected into the system prompt so the assistant can give patient-specific guidance.

Responses stream as Server-Sent Events (SSE) back to the mobile app, rendered token-by-token.

---

### Dashboard & Outbreak Monitoring

**Screen:** `app/(tabs)/dashboard.tsx`

Shows:
- Today's screening count and total high-risk patients
- Outbreak alert card (red if active)
- Priority follow-up list — patients whose most recent session was medium or high risk
- Recent outbreak events log

**Outbreak detection** (`src/providers/OutbreakProvider.tsx`):
- Alerts are generated on the client when multiple high-risk sessions are detected within a geographic radius
- Each alert stores: case count, radius in km, GPS centroid coordinates, list of session IDs, and acknowledgement status
- Alerts persist across sessions via `AsyncStorage`
- The health worker can **Acknowledge** an alert or **Report to Supervisor**

**Screen:** `app/outbreak.tsx` — detailed list of all outbreak alerts, each showing GPS coordinates, cluster radius, and case count.

---

### Telemedicine & Doctor Referral

**Screen:** `app/telemedicine.tsx`

After a high/medium-risk screening, the health worker can:
1. **Submit a referral** — `referralService.buildReferralPacket()` assembles patient info, CNN output, recent sound records, and symptoms into a structured referral packet and submits it to eSanjeevani (India's national telemedicine platform).
2. **Chat with a doctor** — navigates to the `doctor-chat` tab (powered by `DoctorCommProvider`)
3. **Call a doctor** — navigates to `app/doctor-call.tsx`

---

## Backend

The backend is a **FastAPI** application in `pneumoscan/server/`.

### Audio Pipeline

**File:** `server/audio.py`

Raw PCM audio (`uint8`, mono, 8 kHz) goes through a five-stage DSP pipeline before feature extraction:

```
uint8 bytes
  → float32 decode  (value − 128) / 128  → range [−1, 1]
  → DC offset removal  (subtract mean)
  → 4th-order Butterworth bandpass filter  100 – 2000 Hz
  → Pre-emphasis  y[n] = x[n] − 0.97·x[n−1]
  → Peak normalisation  to |peak| = 0.9
```

**Quality metrics** computed per recording:
- `rmsDb` / `peakDb` — signal energy
- `dcOffsetRaw` — DC bias before filtering
- `clippingRatio` — fraction of samples near digital ceiling
- `silenceRatio` — fraction of 20 ms frames below −34 dB
- `snrDb` — estimated signal-to-noise ratio
- `durationSec` — recording length

Automated **warnings** are raised if: clipping > 5%, energy too low, silence > 60%, duration < 3 s, or DC offset > ±0.1.

**MFCC feature extraction:**
- 25 ms Hamming window, 10 ms hop
- MFCC coefficients extracted via `librosa`
- Feature matrix padded/truncated to match the TFLite model's expected input shape

---

### ML Inference

**File:** `server/audio.py` — `load_model()`, `run_tflite()`

The TFLite model (`lung_cnn.tflite`) is a CNN trained on respiratory audio. It classifies recordings into **6 classes**:

| Class | Description |
|-------|-------------|
| Pneumonia | Bacterial/viral lung infection |
| COPD | Chronic Obstructive Pulmonary Disease |
| Bronchiectasis | Permanent bronchial dilation |
| Bronchiolitis | Inflammation of small airways |
| URTI | Upper Respiratory Tract Infection |
| Healthy | No significant abnormality |

At startup, the model is loaded via `tflite_runtime` (or `tensorflow` as fallback). If no model file is found, the server returns mock predictions so development can continue without a model.

---

### REST API Routers

#### `POST /predict`
Accepts raw PCM audio, runs the full DSP + MFCC + TFLite pipeline, saves the raw audio and analysis JSON to disk, and returns class probabilities + quality metrics.

#### `GET /screenings`
Lists the most recent analysis JSON files saved to disk.

#### `GET /health`
Returns server status, model load state, and input tensor shape.

#### `/auth` router
- `POST /auth/register` — create a new user account
- `POST /auth/login` — returns a JWT bearer token
- `GET /auth/me` — returns the current user's profile
- `PUT /auth/me` — update profile fields (phone, language, clinic name, etc.)

#### `/patients` router
Full CRUD for patients, screening sessions, and medical records:
- `GET/POST /patients` — list or create patients
- `GET/PUT/DELETE /patients/{id}` — individual patient management
- `GET/POST /patients/{id}/sessions` — screening session history
- `GET/POST /patients/{id}/records` — medical record notes

#### `/ai` router
- `POST /ai/chat` — streaming SSE chat with the `coordinator_agent` (GPT-4o-mini + pydantic-ai tools)
- `POST /ai/screening-insights` — generate triage insight from CNN output for the results screen
- `POST /ai/ocr` — extract text from a document image (medical record OCR)

#### `/communications` router
- Handles doctor chat messages and call coordination between the health worker and a remote physician

---

### Database

SQLite via **SQLAlchemy** ORM. Tables:
- `users` — health worker accounts (with phone, language, clinic, emergency contact)
- `patients` — patient registry (age, village, ASHA worker ID, weight)
- `screening_sessions` — individual screening runs linked to patients
- `medical_records` — clinical notes and history per patient

Schema is auto-migrated at startup: new columns are patched in with `ALTER TABLE` if they don't exist yet.

---

## Signal Processing & Fusion

**File:** `src/features/audio/dualSignalFusion.ts`

When both a wearable stethoscope and a cough microphone recording are available, results are **fused** using a weighted average:

```
fused_prob[class] = wearable_prob[class] × 0.7 + cough_prob[class] × 0.3
fused_confidence  = wearable_confidence × 0.7 + cough_confidence × 0.3
```

The wearable signal is trusted more (70%) because it captures lung sounds directly at the chest wall. The cough mic provides supplementary context.

**Risk bucketing** from the fused pneumonia probability:
| Pneumonia prob | Risk bucket |
|---|---|
| ≥ 0.6 | `high` |
| 0.3 – 0.59 | `medium` |
| < 0.3 | `low` |

**Trend tracking** compares current risk against the patient's most recent previous session: `improving` / `stable` / `worsening` / `first_session`.

---

## Triage Decision Engine

**File:** `src/features/inference/triage.ts`

After fusion, a rule-based guardrails engine decides whether doctor escalation is required:

| Condition | Escalation | Repeat required |
|---|---|---|
| Severe symptoms reported | ✅ | ❌ |
| Not all 4 lung zones recorded | ✅ | ✅ |
| Model confidence < 65% | ✅ | ✅ |
| Signal quality score < 55% | ✅ | ✅ |
| Risk bucket is medium or high | ✅ | ❌ |
| Low risk, good quality | ❌ | ❌ |

This ensures that uncertainty in the AI output always translates into a conservative recommendation to involve a doctor.

---

## State Management (Providers)

All global state is managed through React Context providers in `src/providers/`:

| Provider | Manages |
|---|---|
| `AuthProvider` | JWT token, user profile, login/register/logout |
| `PatientProvider` | Patient list, screening sessions, medical records, local sync with backend |
| `OutbreakProvider` | Outbreak alert list, acknowledgements, persisted via AsyncStorage |
| `AiProvider` | AI chat message history, streaming state |
| `SppProvider` | Bluetooth SPP wearable connection and audio data streaming |
| `DoctorCommProvider` | Doctor chat messages and communication state |
| `NetworkProvider` | Online/offline detection for graceful degradation |
| `AppProvider` | Root wrapper that composes all providers |

---

## Data Flow: End-to-End Screening

```
Health worker selects a patient
         │
         ▼
Screening screen guides zone-by-zone placement
         │
         ▼
Audio recorded (SPP wearable OR phone mic)
         │
         ▼
Raw PCM bytes uploaded to  POST /predict
         │
         ▼
Server: bandpass → MFCC → TFLite CNN
         │
         ▼
Class probabilities + quality metrics returned
         │
         ▼
Client: dualSignalFusion() (if cough recorded too)
         │
         ▼
deriveTriageDecision() — guardrails check
         │
         ▼
POST /ai/screening-insights → GPT-4o-mini generates
plain-language verdict + next actions
         │
         ▼
Results screen shows:
  • Risk badge (Low / Medium / High)
  • AI triage insight
  • Per-class probability chart
  • Signal quality metrics
         │
    ┌────┴────┐
    │         │
Low risk   Medium/High risk
    │         │
Monitor    Telemedicine referral (eSanjeevani)
           + Optional doctor chat/call
           + Outbreak alert check
```
