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

export async function resetApiUrl(): Promise<void> {
  _apiUrl = ENV_API_URL;
  await AsyncStorage.removeItem(STORAGE_KEY);
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

  return fetch(`${_apiUrl}${path}`, {
    ...options,
    headers,
  });
}
