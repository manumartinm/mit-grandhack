import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { InputField, Button } from "../src/components";
import { useAuth } from "../src/providers/AuthProvider";
import { getApiUrl, setApiUrl, loadApiUrl } from "../src/config/api";

type Tab = "login" | "register";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading,
    error,
    clearError,
    login: loginFn,
    register: registerFn,
    fetchMe,
  } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [apiUrlInput, setApiUrlInput] = useState("");
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  useEffect(() => {
    loadApiUrl().then((url) => setApiUrlInput(url));
    fetchMe();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/home");
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    const ok = await loginFn(email.trim(), password.trim());
    if (ok) router.replace("/home");
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim() || !fullName.trim()) return;
    const ok = await registerFn(email.trim(), password.trim(), fullName.trim());
    if (ok) {
      setRegisterSuccess(true);
      setTab("login");
      setTimeout(() => setRegisterSuccess(false), 4000);
    }
  };

  const saveApiUrl = async () => {
    if (apiUrlInput.trim()) {
      await setApiUrl(apiUrlInput.trim());
      setShowApiConfig(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View
            style={styles.iconCircle}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Stethoscan logo"
          >
            <Image
              source={require("../assets/favicon.jpeg")}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.appName} maxFontSizeMultiplier={2}>
            {t("common.appName")}
          </Text>
          <Text style={styles.tagline} maxFontSizeMultiplier={2}>
            {t("common.tagline")}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === "login" && styles.tabActive]}
              onPress={() => {
                setTab("login");
                clearError();
              }}
              accessibilityRole="tab"
              accessibilityLabel="Login tab"
              accessibilityState={{ selected: tab === "login" }}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === "login" && styles.tabTextActive,
                ]}
              >
                Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === "register" && styles.tabActive]}
              onPress={() => {
                setTab("register");
                clearError();
              }}
              accessibilityRole="tab"
              accessibilityLabel="Register tab"
              accessibilityState={{ selected: tab === "register" }}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === "register" && styles.tabTextActive,
                ]}
              >
                Register
              </Text>
            </TouchableOpacity>
          </View>

          {registerSuccess && (
            <View style={styles.successBanner} accessibilityLiveRegion="polite">
              <Text style={styles.successText}>
                Account created! Please log in.
              </Text>
            </View>
          )}

          {error && (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {tab === "register" && (
            <InputField
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Dr. Priya Sharma"
            />
          )}
          <InputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="doctor@hospital.in"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <InputField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
            secureTextEntry
          />

          {tab === "login" ? (
            <Button
              title={isLoading ? "Logging in..." : "Login"}
              onPress={handleLogin}
              style={styles.mainBtn}
              disabled={isLoading}
            />
          ) : (
            <Button
              title={isLoading ? "Creating account..." : "Create Account"}
              onPress={handleRegister}
              style={styles.mainBtn}
              disabled={isLoading}
            />
          )}

          {isLoading && (
            <ActivityIndicator style={styles.spinner} color="#326EA2" />
          )}

          <TouchableOpacity
            style={styles.apiToggle}
            onPress={() => setShowApiConfig(!showApiConfig)}
            accessibilityRole="button"
            accessibilityLabel={
              showApiConfig
                ? "Hide server configuration"
                : "Show server configuration"
            }
          >
            <Text style={styles.apiToggleText}>
              {showApiConfig ? "Hide" : "Server"}: {getApiUrl()}
            </Text>
          </TouchableOpacity>

          {showApiConfig && (
            <View style={styles.apiConfig}>
              <InputField
                label="API URL (ngrok or local)"
                value={apiUrlInput}
                onChangeText={setApiUrlInput}
                placeholder="https://abc123.ngrok-free.app"
                autoCapitalize="none"
              />
              <Button
                title="Save URL"
                onPress={saveApiUrl}
                variant="secondary"
                size="sm"
              />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { flexGrow: 1, paddingBottom: 40 },
  hero: { alignItems: "center", paddingTop: 60, paddingBottom: 20 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(50,110,162,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(29,68,102,0.14)",
  },
  logoImage: { width: "100%", height: "100%" },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#20374C",
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 14, color: "#3E5E7A", marginTop: 4 },
  form: { paddingHorizontal: 24 },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: { fontSize: 14, fontWeight: "500", color: "#4B5563" },
  tabTextActive: { color: "#326EA2", fontWeight: "600" },
  successBanner: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  successText: {
    fontSize: 13,
    color: "#326EA2",
    textAlign: "center",
    fontWeight: "500",
  },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, color: "#DC2626", textAlign: "center" },
  mainBtn: { marginTop: 8, marginBottom: 12 },
  spinner: { marginBottom: 8 },
  apiToggle: { alignItems: "center", paddingVertical: 12 },
  apiToggleText: { fontSize: 12, color: "#4B5563" },
  apiConfig: { marginTop: 4 },
});
