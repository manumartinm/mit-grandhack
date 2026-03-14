# EMR OCR Feature Design

**Date:** 2026-03-14  
**Status:** Approved

## Overview

Add OCR capability to the Electronic Medical Records (EMR) form in the patient detail screen. Users can take a photo or pick an image from their gallery; OpenAI GPT-4o vision extracts the text and auto-populates the Content field. Typing remains available as before.

## Scope

- **In scope:** image capture (camera + gallery), GPT-4o vision OCR, content field auto-fill, loading/error states
- **Out of scope:** PDF support, server-side processing, auto-filling title/date from OCR output

## Architecture

### New service function — `openaiService.ts`

```typescript
extractTextFromImage(apiKey: string, base64Image: string, mimeType: string): Promise<string>
```

Calls `POST https://api.openai.com/v1/chat/completions` with `gpt-4o`, passing the image as a base64 data URL inside the message content. System prompt instructs the model to extract plain medical text only.

### UI change — `app/patients/detail.tsx`

- "Content" label row gets a 📷 icon button to the right
- Tapping opens a `Modal` bottom sheet with: **Take Photo** / **Choose from Library**
- `expo-image-picker` captures the image with `base64: true`
- While OCR runs: loading overlay on Content field with "Extracting text..."
- On success: `setContent(extractedText)` — user can still edit
- On error: inline error below Content field (same `emrError` state)

## Data Flow

```
📷 button tapped
  → Modal: Take Photo | Choose from Library
  → expo-image-picker (base64: true)
  → extractTextFromImage(apiKey, base64, mimeType)
    → GPT-4o /v1/chat/completions with image_url data URL
    → returns extracted text
  → setContent(text)
```

## Error Handling

| Case | Behavior |
|---|---|
| Camera permission denied | Alert: "Enable camera access in Settings" |
| No image selected (cancelled) | No-op, modal closes |
| GPT-4o API error | `emrError` shown inline below Content |
| No text detected | Content set to `""`, inline warning shown |

## Dependencies

- `expo-image-picker` — already available in Expo SDK (no new install needed)
- `gpt-4o` model — already configured via `EXPO_PUBLIC_OPENAI_KEY` in `.env.local`
