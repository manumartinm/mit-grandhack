import React, { useRef, useCallback, useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../src/components";
import { usePatients } from "../src/providers/PatientProvider";
import { useAi } from "../src/providers/AiProvider";
import { useAuth } from "../src/providers/AuthProvider";
import { useOutbreak } from "../src/providers/OutbreakProvider";
import { streamChat } from "../src/services/aiService";

export default function AiAssistantScreen() {
  const { t } = useTranslation();
  const segments = useSegments();
  const inTabs = segments[0] === "(tabs)";
  const composerBottomInset = inTabs ? 84 : 0;
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { token, isAuthenticated } = useAuth();

  const {
    messages,
    isStreaming,
    addMessage,
    appendToLastAssistant,
    setStreaming,
    clearMessages,
  } = useAi();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const {
    selectedPatientId,
    patients,
    getSessionsForPatient,
    getRecentSoundRecords,
    medicalRecordsByPatient,
  } = usePatients();

  const [activePatientId, setActivePatientId] = useState<string | null>(
    selectedPatientId,
  );

  const handleSelectPatient = useCallback(
    (id: string) => {
      if (id !== activePatientId) {
        setActivePatientId(id);
        clearMessages();
      }
      setShowPatientPicker(false);
      setPickerSearch("");
    },
    [activePatientId, clearMessages],
  );

  const filteredPatients = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.village.toLowerCase().includes(q),
    );
  }, [patients, pickerSearch]);

  const patient = patients.find((p) => p.id === activePatientId) ?? null;
  const sessions = activePatientId
    ? getSessionsForPatient(activePatientId)
    : [];
  const recentRecords = getRecentSoundRecords(activePatientId ?? "");
  const medicalRecords = activePatientId
    ? (medicalRecordsByPatient[activePatientId] ?? [])
    : [];
  const { alerts: outbreakAlerts } = useOutbreak();
  const latestCnn = sessions[0]?.cnnOutput ?? null;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (!isAuthenticated || !token) {
      setError("Please sign in to use the AI assistant.");
      return;
    }
    if (!patient) {
      setError("Please select a patient using the selector above.");
      return;
    }
    if (patient.id.startsWith("local-")) {
      setError(
        "Patient is still syncing to the server. Please wait a moment and try again.",
      );
      return;
    }

    setInput("");
    setError(null);

    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user" as const,
      content: text,
    };
    addMessage(userMsg);

    const assistantMsg = {
      id: `a-${Date.now()}`,
      role: "assistant" as const,
      content: "",
    };
    addMessage(assistantMsg);
    setStreaming(true);
    scrollToBottom();

    // Include the freshly submitted user message in the API payload.
    const allMessages = [...messages, userMsg];

    const controller = new AbortController();
    abortRef.current = controller;

    await streamChat(
      allMessages,
      {
        patient,
        latestCnn,
        recentRecords,
        sessions,
        outbreakAlerts,
        medicalRecords,
      },
      (delta) => {
        appendToLastAssistant(delta);
        scrollToBottom();
      },
      () => setStreaming(false),
      (err) => {
        setError(err);
        setStreaming(false);
      },
      controller.signal,
      token,
    );
  }, [
    input,
    isAuthenticated,
    token,
    isStreaming,
    patient,
    latestCnn,
    recentRecords,
    sessions,
    outbreakAlerts,
    medicalRecords,
    messages,
    addMessage,
    appendToLastAssistant,
    setStreaming,
    scrollToBottom,
  ]);

  // Animated dots for the "thinking" indicator
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isStreaming) return;
    const makePulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ]),
      );
    const a1 = makePulse(dot1, 0);
    const a2 = makePulse(dot2, 200);
    const a3 = makePulse(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [isStreaming, dot1, dot2, dot3]);

  const hasRecentRecordings = recentRecords.length > 0;
  const greeting = !patient
    ? "I'm Sthetho Scan AI. Select a patient above to begin a contextual consultation."
    : latestCnn && hasRecentRecordings
      ? `I'm Sthetho Scan AI. I have access to ${patient.name}'s screening data and medical records. Ask me anything about the results, risk assessment, or next steps.`
      : `I'm Sthetho Scan AI. I don't have a recent lung recording yet for ${patient.name}, so I can't provide meaningful insights. Please run a new lung check first, then come back.`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {!inTabs && (
        <Header title={t("ai.title")} subtitle={patient?.name} showBack />
      )}

      {/* Patient selector */}
      <TouchableOpacity
        style={styles.patientSelector}
        onPress={() => setShowPatientPicker(true)}
        accessibilityRole="button"
        accessibilityLabel="Select patient for AI consultation"
      >
        <View style={styles.patientSelectorLeft}>
          <Ionicons name="person-circle-outline" size={20} color="#185FA5" />
          <Text style={styles.patientSelectorLabel} numberOfLines={1}>
            {patient ? patient.name : "Select a patient…"}
          </Text>
          {patient && (
            <Text style={styles.patientSelectorMeta}>
              {patient.age}y • {patient.village || "N/A"}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={16} color="#185FA5" />
      </TouchableOpacity>

      {/* Patient picker modal */}
      <Modal
        visible={showPatientPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPatientPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPatientPicker(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Patient</Text>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search by name or village…"
              placeholderTextColor="#9CA3AF"
              value={pickerSearch}
              onChangeText={setPickerSearch}
              autoFocus
            />
            <FlatList
              data={filteredPatients}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>No patients found.</Text>
              }
              renderItem={({ item }) => {
                const isActive = item.id === activePatientId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalPatientRow,
                      isActive && styles.modalPatientRowActive,
                    ]}
                    onPress={() => handleSelectPatient(item.id)}
                  >
                    <View style={styles.modalPatientAvatar}>
                      <Text style={styles.modalPatientAvatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.modalPatientInfo}>
                      <Text style={styles.modalPatientName}>{item.name}</Text>
                      <Text style={styles.modalPatientMeta}>
                        {item.age}y • {item.sex} •{" "}
                        {item.village || "Village N/A"}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#185FA5"
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.disclaimerBar}>
        <Text style={styles.disclaimerText}>{t("ai.disclaimer")}</Text>
      </View>
      {patient && !hasRecentRecordings && (
        <View style={styles.recordFirstBanner}>
          <Text style={styles.recordFirstText}>
            Please record lung sounds first. AI insights require a recent
            recording.
          </Text>
        </View>
      )}

      {!isAuthenticated && (
        <View style={styles.keyBanner}>
          <View style={styles.keyPrompt}>
            <Text style={styles.keyPromptText}>
              Sign in to use server-side AI assistant.
            </Text>
          </View>
        </View>
      )}

      {error && (
        <View
          style={styles.errorBar}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.msgContent}
        accessibilityLabel="Conversation messages"
      >
        <View style={[styles.bubble, styles.aiBubble]}>
          <Text style={[styles.bubbleText, styles.aiText]}>{greeting}</Text>
        </View>

        {messages.map((msg, idx) => {
          const isLastMsg = idx === messages.length - 1;
          const isLoadingBubble =
            msg.role === "assistant" && isStreaming && isLastMsg && !msg.content;
          return (
            <View
              key={msg.id}
              style={[
                styles.bubble,
                msg.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              {isLoadingBubble ? (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator size="small" color="#185FA5" />
                  {[dot1, dot2, dot3].map((dot, i) => (
                    <Animated.View
                      key={i}
                      style={[styles.thinkingDot, { opacity: dot }]}
                    />
                  ))}
                </View>
              ) : (
                <Text
                  style={[
                    styles.bubbleText,
                    msg.role === "user" ? styles.userText : styles.aiText,
                  ]}
                >
                  {msg.content}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={t("ai.placeholder")}
          placeholderTextColor="#9CA3AF"
          multiline
          onSubmitEditing={handleSend}
          editable={!isStreaming}
          accessibilityLabel="Message input"
          accessibilityHint="Type your question for the AI assistant"
        />
        <TouchableOpacity
          style={[styles.sendBtn, isStreaming && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={isStreaming}
          accessibilityRole="button"
          accessibilityLabel={t("accessibility.sendMessage")}
          accessibilityHint="Sends the current message to the assistant"
          accessibilityState={{ disabled: isStreaming }}
        >
          <Text style={styles.sendIcon}>&#x2191;</Text>
        </TouchableOpacity>
      </View>

      {messages.length > 0 && (
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={clearMessages}
          accessibilityRole="button"
          accessibilityLabel={t("accessibility.clearChat")}
        >
          <Text style={styles.clearText}>Clear chat</Text>
        </TouchableOpacity>
      )}
      {inTabs && <View style={{ height: composerBottomInset }} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F8FD" },
  patientSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(24,95,165,0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(24,95,165,0.15)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  patientSelectorLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  patientSelectorLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D2746",
    flexShrink: 1,
  },
  patientSelectorMeta: {
    fontSize: 12,
    color: "#4B6B8A",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#F3F8FD",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingBottom: 32,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(4,44,83,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0D2746",
    textAlign: "center",
    paddingVertical: 10,
  },
  modalSearch: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0D2746",
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.14)",
  },
  modalList: { marginHorizontal: 16 },
  modalEmpty: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 24,
    fontSize: 14,
  },
  modalPatientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.1)",
  },
  modalPatientRowActive: {
    borderColor: "#185FA5",
    backgroundColor: "rgba(24,95,165,0.08)",
  },
  modalPatientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(24,95,165,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPatientAvatarText: {
    color: "#185FA5",
    fontSize: 16,
    fontWeight: "700",
  },
  modalPatientInfo: { flex: 1 },
  modalPatientName: { fontSize: 15, fontWeight: "700", color: "#0D2746" },
  modalPatientMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  disclaimerBar: {
    backgroundColor: "rgba(240,153,123,0.18)",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disclaimerText: { fontSize: 11, color: "#D85A30", textAlign: "center" },
  keyBanner: {
    backgroundColor: "rgba(216,90,48,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  keyPrompt: { alignItems: "center" },
  keyPromptText: { fontSize: 13, color: "#D85A30", fontWeight: "600" },
  errorBar: {
    backgroundColor: "rgba(216,90,48,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: { fontSize: 12, color: "#D85A30", textAlign: "center" },
  voiceStateBar: {
    backgroundColor: "rgba(24,95,165,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  voiceStateText: {
    color: "#185FA5",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  recordFirstBanner: {
    backgroundColor: "rgba(216,90,48,0.14)",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(4,44,83,0.08)",
  },
  recordFirstText: {
    color: "#D85A30",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  messages: { flex: 1 },
  msgContent: { padding: 16, paddingBottom: 8 },
  bubble: {
    maxWidth: "85%",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#185FA5",
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.66)",
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.12)",
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  userText: { color: "#FFFFFF" },
  aiText: { color: "#0D2746" },
  thinking: { color: "#4B5563", fontSize: 14, fontStyle: "italic" },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  thinkingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#185FA5",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(4,44,83,0.12)",
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#0D2746",
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#185FA5",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D2746",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnRecording: {
    backgroundColor: "#D85A30",
  },
  sendBtnDisabled: { backgroundColor: "#D1D5DB" },
  sendIcon: { fontSize: 20, color: "#FFFFFF", fontWeight: "700" },
  clearBtn: {
    alignItems: "center",
    minHeight: 44,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(4,44,83,0.08)",
  },
  clearText: { fontSize: 12, color: "#2D4E73", fontWeight: "600" },
});
