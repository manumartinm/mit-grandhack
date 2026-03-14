import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pneumoscan-api-url';
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

let _apiUrl: string = ENV_API_URL;

export async function loadApiUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) _apiUrl = stored;
  } catch {}
  return _apiUrl;
}

export async function setApiUrl(url: string): Promise<void> {
  _apiUrl = url.replace(/\/+$/, '');
  await AsyncStorage.setItem(STORAGE_KEY, _apiUrl);
}

export function getApiUrl(): string {
  return _apiUrl;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return retryFetch(
    () =>
      fetch(`${_apiUrl}${path}`, {
        ...options,
        headers,
      }),
    3
  );
}

export function isLikelyOfflineError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror")
  );
}

export function parseApiError(body: any, status: number): string {
  // FastAPI/Pydantic commonly returns validation issues as detail[]
  if (Array.isArray(body?.detail)) {
    const messages = body.detail
      .map((entry: any) => entry?.msg ?? String(entry))
      .filter(Boolean)
      .join("; ");
    if (messages) return messages;
  }
  if (typeof body?.detail === "string") return body.detail;
  if (typeof body?.error?.message === "string") return body.error.message;
  return `Request failed (${status})`;
}

export async function retryFetch<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 300
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      const waitMs = initialDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}
