# Screening Insights & Self-Patient Design

**Date:** 2026-03-14  
**Status:** Approved

## Overview

Three connected changes:
1. Auto-select the logged-in user as the patient throughout the app
2. Generate AI insights (GPT-4o-mini) automatically on the screening results screen
3. Show a scrollable list of past lung sound recordings on the results screen and home screen

## Self-Patient Auto-Selection

**Where:** `HomeScreen` — already has access to both `useAuth` and `usePatients`.

**How:** On login, find a patient with `id === "self-{user.id}"` in the local store. If not found, create one locally (`ashaWorkerId: String(user.id)`) and call `selectPatient`. Stored in AsyncStorage so it persists. Effect depends only on `isAuthenticated` and `user.id` to avoid re-running on every patient list change.

## AI Insights (results screen)

**Function:** `generateScreeningInsights(apiKey, cnn, patient, sessions)` in `openaiService.ts`  
**Model:** `gpt-4o-mini`, single non-streaming completion, max 400 tokens  
**Prompt:** Passes pneumonia probability, risk bucket, confidence, top classes, trend, signal quality, escalation flag, patient age/comorbidities, and prior session summary.  
**Output:** Numbered list of 3-4 plain-language insights for the health worker.  
**UX:** "Clinical Insights" card shows a spinner on load, then replaces with parsed GPT lines. Falls back to the existing rule-based bullets on error.

## Recordings List

**Results screen:** A new "Recordings History" card below insights showing all past sessions for the patient. Each row: date/time, `RiskBadge`, confidence %, signal source icon.

**Home screen:** A "Your Recordings" section below the action buttons using the same row format. Limited to 10 most recent. Tapping a row sets that session as latest and navigates to `/screening/results`.

## Dependencies

- `EXPO_PUBLIC_OPENAI_API_KEY` — already in `.env.local`
- No new packages required
