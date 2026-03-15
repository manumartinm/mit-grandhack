import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, isLikelyOfflineError, parseApiError } from "../config/api";
import type { UserProfile } from "../types";
import { useNetwork } from "./NetworkProvider";

const STORAGE_KEY = "pneumoscan-auth";

interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  phone?: string | null;
  clinic_name?: string | null;
  created_at: string;
}

interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<boolean>;
  fetchMe: () => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isConnected } = useNetwork();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          setUser(stored.user ?? null);
          setProfile(stored.profile ?? null);
          setToken(stored.token ?? null);
          setIsAuthenticated(stored.isAuthenticated ?? false);
        }
      } catch {
        /* ignore */
      } finally {
        hydrated.current = true;
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user, profile, token, isAuthenticated }),
    ).catch(() => {});
  }, [user, profile, token, isAuthenticated]);

  useEffect(() => {
    if (!hydrated.current || !token || !isConnected) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch("/auth/me", {}, token);
        if (cancelled) return;

        if (res.status === 401) {
          // Token is stale/invalid (common after DB reset). Clear local auth state.
          setUser(null);
          setProfile(null);
          setToken(null);
          setIsAuthenticated(false);
          await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
          setError("Session expired. Please sign in again.");
          return;
        }

        if (!res.ok) return;
        const me: AuthUser = await res.json();
        if (!cancelled) {
          setUser(me);
          setIsAuthenticated(true);
        }
      } catch {
        // Non-auth network failures should not force logout.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, isConnected]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!isConnected) {
          throw new Error("You're offline. Please connect to sign in.");
        }
        const loginRes = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        if (!loginRes.ok) {
          const body = await loginRes.json().catch(() => ({}));
          throw new Error(parseApiError(body, loginRes.status));
        }
        const { access_token } = await loginRes.json();

        const meRes = await apiFetch("/auth/me", {}, access_token);
        if (!meRes.ok) throw new Error("Failed to fetch user profile");
        const me: AuthUser = await meRes.json();

        setToken(access_token);
        setUser(me);
        setIsAuthenticated(true);
        return true;
      } catch (e: any) {
        setError(
          isLikelyOfflineError(e)
            ? "You're offline. Please connect to sign in."
            : (e.message ?? "Login failed"),
        );
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected],
  );

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!isConnected) {
          throw new Error("You're offline. Please connect to register.");
        }
        const res = await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, full_name: fullName }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(parseApiError(body, res.status));
        }
        return await login(email, password);
      } catch (e: any) {
        setError(
          isLikelyOfflineError(e)
            ? "You're offline. Please connect to register."
            : (e.message ?? "Registration failed"),
        );
        setIsLoading(false);
        return false;
      }
    },
    [isConnected, login],
  );

  const fetchMe = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      if (!isConnected) return;
      const res = await apiFetch("/auth/me", {}, token);
      if (!res.ok) throw new Error("Failed to fetch profile");
      const me: AuthUser = await res.json();
      setUser(me);
    } catch (e: any) {
      setError(
        isLikelyOfflineError(e)
          ? "You're offline. Profile data may be outdated."
          : e.message,
      );
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, token]);

  const updateProfile = useCallback(
    async (nextProfile: UserProfile) => {
      setProfile(nextProfile);
      if (!token) return;
      try {
        const profilePayload = {
          phone: nextProfile.phone,
          preferred_language: nextProfile.preferredLanguage,
          emergency_contact_name: nextProfile.emergencyContactName,
          emergency_contact_phone: nextProfile.emergencyContactPhone,
          clinic_name: nextProfile.clinicName,
        };
        await apiFetch(
          "/auth/profile",
          {
            method: "PUT",
            body: JSON.stringify(profilePayload),
          },
          token,
        );
      } catch {
        // Profile is still persisted locally.
      }
    },
    [token],
  );

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    setProfile(null);
    setIsAuthenticated(false);
    setError(null);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        token,
        isAuthenticated,
        isLoading,
        error,
        login,
        register,
        fetchMe,
        updateProfile,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
