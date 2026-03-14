import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useChat } from '@ai-sdk/react';
import { Header } from '../src/components';
import { usePatientStore } from '../src/stores/usePatientStore';
import { useAiStore } from '../src/stores/useAiStore';
import { useOutbreakStore } from '../src/stores/useOutbreakStore';

const TOOL_LABELS: Record<string, string> = {
  getPatientInfo: 'Patient EMR',
  getLatestScreening: 'CNN Screening',
  getScreeningHistory: 'History',
  assessPneumoniaRisk: 'Risk Assessment',
  checkOutbreakStatus: 'Outbreak Check',
  recommendDoctorReferral: 'Doctor Referral',
};

export default function AiAssistantScreen() {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const openaiApiKey = useAiStore((s) => s.openaiApiKey);
  const setOpenaiApiKey = useAiStore((s) => s.setOpenaiApiKey);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const selectedPatientId = usePatientStore((s) => s.selectedPatientId);
  const patient = usePatientStore((s) =>
    s.patients.find((p) => p.id === selectedPatientId) ?? null
  );
  const sessions = usePatientStore((s) =>
    s.sessions
      .filter((ses) => ses.patientId === selectedPatientId)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
  );
  const recentRecords = usePatientStore.getState().getRecentSoundRecords(
    selectedPatientId ?? ''
  );
  const outbreakAlerts = useOutbreakStore((s) => s.alerts);

  const latestCnn = sessions[0]?.cnnOutput ?? null;

  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    status,
  } = useChat({
    api: '/api/chat',
    body: {
      patient,
      latestCnn,
      recentRecords,
      sessions,
      outbreakAlerts,
    },
    headers: openaiApiKey ? { 'x-api-key': openaiApiKey } : undefined,
    initialMessages: latestCnn
      ? [
          {
            id: 'init-greeting',
            role: 'assistant' as const,
            content: `I'm PneumoScan AI. I have access to ${patient?.name ?? 'the patient'}'s screening data and medical records. Ask me anything about the results, risk assessment, or next steps.`,
          },
        ]
      : [
          {
            id: 'init-no-data',
            role: 'assistant' as const,
            content: `I'm PneumoScan AI. No screening data is loaded yet. Please run a screening first, then come back to discuss the results.`,
          },
        ],
  });

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }, [messages]);

  const saveApiKey = (key: string) => {
    setOpenaiApiKey(key);
    setShowKeyInput(false);
  };

  const onSubmit = () => {
    if (!input.trim() || !openaiApiKey) return;
    handleSubmit();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title={t('ai.title')} subtitle={patient?.name} showBack />

      <View style={styles.disclaimerBar}>
        <Text style={styles.disclaimerText}>{t('ai.disclaimer')}</Text>
      </View>

      {!openaiApiKey && (
        <View style={styles.keyBanner}>
          {showKeyInput ? (
            <View style={styles.keyInputRow}>
              <TextInput
                style={styles.keyInput}
                placeholder="sk-..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                onSubmitEditing={(e) => saveApiKey(e.nativeEvent.text)}
                returnKeyType="done"
              />
            </View>
          ) : (
            <TouchableOpacity onPress={() => setShowKeyInput(true)} style={styles.keyPrompt}>
              <Text style={styles.keyPromptText}>
                Tap to enter OpenAI API key to enable AI assistant
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.msgContent}
      >
        {messages.map((msg: any) => {
          const toolInvocations = (msg as any).parts?.filter(
            (p: any) => p.type === 'tool-invocation'
          );

          return (
            <View key={msg.id}>
              {toolInvocations && toolInvocations.length > 0 && (
                <View style={styles.toolRow}>
                  {toolInvocations.map((ti: any, idx: number) => (
                    <View key={idx} style={styles.toolBadge}>
                      <Text style={styles.toolText}>
                        {TOOL_LABELS[ti.toolInvocation?.toolName] ??
                          ti.toolInvocation?.toolName ??
                          'Tool'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {msg.content ? (
                <View
                  style={[
                    styles.bubble,
                    msg.role === 'user' ? styles.userBubble : styles.aiBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      msg.role === 'user' ? styles.userText : styles.aiText,
                    ]}
                  >
                    {msg.content}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}

        {isLoading && (
          <View style={[styles.bubble, styles.aiBubble]}>
            <Text style={styles.thinking}>
              {status === 'streaming' ? 'Responding...' : 'Thinking...'}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={t('ai.placeholder')}
          placeholderTextColor="#9CA3AF"
          multiline
          onSubmitEditing={onSubmit}
          editable={!!openaiApiKey}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!openaiApiKey || isLoading) && styles.sendBtnDisabled]}
          onPress={onSubmit}
          disabled={!openaiApiKey || isLoading}
        >
          <Text style={styles.sendIcon}>&#x2191;</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  disclaimerBar: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disclaimerText: { fontSize: 11, color: '#D97706', textAlign: 'center' },
  keyBanner: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  keyPrompt: { alignItems: 'center' },
  keyPromptText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  keyInputRow: { flexDirection: 'row', gap: 8 },
  keyInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messages: { flex: 1 },
  msgContent: { padding: 16, paddingBottom: 8 },
  toolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
    paddingLeft: 4,
  },
  toolBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  toolText: { fontSize: 10, color: '#0D9488', fontWeight: '600' },
  bubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#0D9488',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5F7FA',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  userText: { color: '#FFFFFF' },
  aiText: { color: '#111827' },
  thinking: { color: '#9CA3AF', fontSize: 14, fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  sendIcon: { fontSize: 20, color: '#FFFFFF', fontWeight: '700' },
});
