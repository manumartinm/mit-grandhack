import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { format } from "date-fns";
import { Button, Card, Header, RiskBadge } from "../../src/components";
import { useAuth } from "../../src/providers/AuthProvider";
import { usePatients } from "../../src/providers/PatientProvider";
import { extractTextFromImage } from "../../src/services/openaiService";
import { colors } from "../../src/theme/colors";
import type { MedicalRecordType, PatientNote } from "../../src/types";

type DetailTab = "screenings" | "records" | "notes";

const NOTES_STORAGE_KEY = "pneumoscan-patient-notes";
const RECORD_TYPES: MedicalRecordType[] = [
  "diagnosis",
  "lab_result",
  "prescription",
  "imaging",
  "other",
];

function buildPatientAiSummary(
  patientName: string,
  risk: "low" | "medium" | "high" | null,
  trend: string | null,
  sessionsCount: number,
): string {
  if (sessionsCount === 0) {
    return `${patientName} does not have completed screenings yet. Start a new visit to capture baseline lung data and document symptoms.`;
  }

  if (risk === "high") {
    return `${patientName} currently trends as high risk and should be prioritized for same-day escalation. Keep close monitoring and refer to a doctor with the latest screening details.`;
  }

  if (risk === "medium") {
    return `${patientName} is in the medium-risk group. Continue close follow-up in the next 24-48 hours and escalate quickly if breathing symptoms worsen.`;
  }

  if (trend === "improving") {
    return `${patientName} currently appears stable-to-improving based on recent screenings. Continue routine monitoring and repeat if symptoms persist.`;
  }

  return `${patientName} is currently low risk from recent screening data. Maintain periodic checks and watch for new red-flag symptoms.`;
}

export default function PatientDetailScreen() {
  const router = useRouter();
  const {
    selectedPatientId,
    patients,
    getSessionsForPatient,
    getMedicalRecordsForPatient,
    addMedicalRecordWithSync,
    removeMedicalRecordWithSync,
    syncMedicalRecords,
  } = usePatients();
  const { token, isAuthenticated } = useAuth();

  const patient = patients.find((p) => p.id === selectedPatientId);
  const sessions = selectedPatientId
    ? getSessionsForPatient(selectedPatientId)
    : [];
  const records = selectedPatientId
    ? getMedicalRecordsForPatient(selectedPatientId)
    : [];
  const latestCnn = sessions[0]?.cnnOutput;

  const [activeTab, setActiveTab] = useState<DetailTab>("screenings");
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [noteSaving, setNoteSaving] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteLinkSession, setNoteLinkSession] = useState<string | null>(null);
  const [noteLinkRecord, setNoteLinkRecord] = useState<number | null>(null);
  const [showNoteLinkSheet, setShowNoteLinkSheet] = useState(false);

  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordType, setRecordType] = useState<MedicalRecordType>("diagnosis");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [recordError, setRecordError] = useState<string | null>(null);
  const [ocrWarning, setOcrWarning] = useState<string | null>(null);
  const [showImageSourceModal, setShowImageSourceModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const aiSummary = useMemo(() => {
    return buildPatientAiSummary(
      patient?.name ?? "This patient",
      latestCnn?.pneumoniaRiskBucket ?? null,
      latestCnn?.trend ?? null,
      sessions.length,
    );
  }, [
    patient?.name,
    latestCnn?.pneumoniaRiskBucket,
    latestCnn?.trend,
    sessions.length,
  ]);

  useEffect(() => {
    if (!selectedPatientId) return;
    AsyncStorage.getItem(`${NOTES_STORAGE_KEY}:${selectedPatientId}`)
      .then((stored) => {
        if (!stored) return;
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setNotes(parsed);
          } else if (typeof parsed === "string" && parsed.trim()) {
            // Migrate legacy plain-text note
            setNotes([{ id: `legacy-${Date.now()}`, text: parsed, createdAt: new Date().toISOString() }]);
          }
        } catch {
          // Legacy plain-text note
          if (stored.trim()) {
            setNotes([{ id: `legacy-${Date.now()}`, text: stored, createdAt: new Date().toISOString() }]);
          }
        }
      })
      .catch(() => {});
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId || !token || !isAuthenticated) return;
    syncMedicalRecords(selectedPatientId, token).catch(() => {});
  }, [selectedPatientId, token, isAuthenticated, syncMedicalRecords]);

  const persistNotes = useCallback(async (updated: PatientNote[]) => {
    if (!selectedPatientId) return;
    await AsyncStorage.setItem(
      `${NOTES_STORAGE_KEY}:${selectedPatientId}`,
      JSON.stringify(updated),
    ).catch(() => {});
  }, [selectedPatientId]);

  const addNote = useCallback(async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      const newNote: PatientNote = {
        id: `note-${Date.now()}`,
        text: noteText.trim(),
        createdAt: new Date().toISOString(),
        ...(noteLinkSession ? { linkedSessionId: noteLinkSession } : {}),
        ...(noteLinkRecord !== null ? { linkedRecordId: noteLinkRecord } : {}),
      };
      const updated = [newNote, ...notes];
      setNotes(updated);
      await persistNotes(updated);
      setNoteText("");
      setNoteLinkSession(null);
      setNoteLinkRecord(null);
      setShowNoteForm(false);
    } finally {
      setNoteSaving(false);
    }
  }, [noteText, noteLinkSession, noteLinkRecord, notes, persistNotes]);

  const deleteNote = useCallback(async (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    await persistNotes(updated);
  }, [notes, persistNotes]);

  const runOcr = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setRecordError("Could not read image data. Please try again.");
        return;
      }
    setOcrLoading(true);
    setRecordError(null);
    setOcrWarning(null);
    try {
      if (!token || !isAuthenticated) {
        throw new Error("Sign in to use document OCR.");
      }
      const mimeType = asset.mimeType ?? "image/jpeg";
      const text = await extractTextFromImage(token, asset.base64, mimeType);
      setContent(text);
      if (!text) {
        setOcrWarning(
          "No readable text was found in the image. Make sure the document is clear and well-lit, then try again.",
        );
      }
    } catch (err: any) {
      setRecordError(err?.message ?? "OCR failed. Please try again.");
    } finally {
      setOcrLoading(false);
    }
    },
    [token, isAuthenticated],
  );

  const handleTakePhoto = useCallback(async () => {
    setShowImageSourceModal(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access required",
        "Enable camera access in Settings.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.85,
    });
    await runOcr(result);
  }, [runOcr]);

  const handleChooseFromLibrary = useCallback(async () => {
    setShowImageSourceModal(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo library access required",
        "Enable photo library access.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.85,
    });
    await runOcr(result);
  }, [runOcr]);

  const addMedicalRecord = useCallback(async () => {
    if (!selectedPatientId || !token || !isAuthenticated) return;
    if (!title.trim() || !content.trim()) {
      setRecordError("Title and content are required.");
      return;
    }
    setRecordError(null);
    try {
      await addMedicalRecordWithSync(
        selectedPatientId,
        {
          recordType,
          title: title.trim(),
          content: content.trim(),
          ...(recordDate.trim() ? { recordDate: recordDate.trim() } : {}),
        },
        token,
      );
      setTitle("");
      setContent("");
      setRecordDate("");
      setShowRecordForm(false);
    } catch (err: any) {
      setRecordError(err?.message ?? "Failed to save medical record.");
    }
  }, [
    selectedPatientId,
    token,
    isAuthenticated,
    recordType,
    title,
    content,
    recordDate,
    addMedicalRecordWithSync,
  ]);

  const deleteMedicalRecord = useCallback(
    async (recordId: number) => {
      if (!selectedPatientId || !token || !isAuthenticated) return;
      try {
        await removeMedicalRecordWithSync(selectedPatientId, recordId, token);
      } catch (err: any) {
        setRecordError(err?.message ?? "Failed to delete record.");
      }
    },
    [selectedPatientId, token, isAuthenticated, removeMedicalRecordWithSync],
  );

  if (!patient) {
    return (
      <View style={styles.container}>
        <Header title="Patient Details" showBack />
        <Text style={styles.emptyText}>Patient not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={patient.name}
        subtitle={`${patient.age}y • ${patient.village || "Village N/A"}`}
        showBack
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Card variant="risk" riskLevel={latestCnn?.pneumoniaRiskBucket}>
          <View style={styles.summaryHeader}>
            <Text style={styles.sectionTitle}>Latest Risk Summary</Text>
            {latestCnn && <RiskBadge risk={latestCnn.pneumoniaRiskBucket} />}
          </View>
          {latestCnn ? (
            <>
              <Text style={styles.summaryText}>
                Pneumonia probability:{" "}
                {(
                  (latestCnn.classProbabilities["Pneumonia"] ?? 0) * 100
                ).toFixed(1)}
                % • Confidence: {(latestCnn.confidence * 100).toFixed(0)}%
              </Text>
              <Text style={styles.summaryText}>
                Trend: {latestCnn.trend.replace("_", " ")}
              </Text>
            </>
          ) : (
            <Text style={styles.summaryText}>No completed screenings yet.</Text>
          )}
        </Card>

        <View style={styles.quickActions}>
          <Button
            title="New Recording"
            onPress={() => router.push("/screening")}
            style={styles.quickActionBtn}
          />
          <Button
            title="AI Doctor Chat"
            variant="secondary"
            onPress={() => router.push("/ai-chat")}
            style={styles.quickActionBtn}
          />
        </View>

        <Card variant="elevated">
          <Text style={styles.sectionTitle}>AI Patient Summary</Text>
          <Text style={styles.summaryText}>{aiSummary}</Text>
        </Card>

        <View style={styles.tabRow}>
          {(["screenings", "records", "notes"] as DetailTab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                style={[styles.tabChip, isActive && styles.tabChipActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    isActive && styles.tabChipTextActive,
                  ]}
                >
                  {tab === "screenings"
                    ? "Screenings"
                    : tab === "records"
                      ? "Records"
                      : "Notes"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === "screenings" && (
          <View style={styles.sectionBlock}>
            {sessions.length === 0 && (
              <Text style={styles.emptySectionText}>
                No screenings available yet.
              </Text>
            )}
            {sessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionTouch}
                onPress={() => router.push("/screening/results")}
              >
                <Card
                  variant={session.cnnOutput ? "risk" : "default"}
                  riskLevel={session.cnnOutput?.pneumoniaRiskBucket}
                >
                  <View style={styles.rowBetween}>
                    <Text style={styles.sessionDate}>
                      {format(new Date(session.startedAt), "MMM d, h:mm a")}
                    </Text>
                    {session.cnnOutput && (
                      <RiskBadge risk={session.cnnOutput.pneumoniaRiskBucket} />
                    )}
                  </View>
                  {session.cnnOutput && (
                    <Text style={styles.summaryText}>
                      Source: {session.signalSource} • Confidence:{" "}
                      {(session.cnnOutput.confidence * 100).toFixed(0)}%
                    </Text>
                  )}
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === "records" && (
          <View style={styles.sectionBlock}>
            {records.length === 0 && (
              <Text style={styles.emptySectionText}>
                No medical records yet.
              </Text>
            )}
            {records.map((record) => (
              <Card key={record.id} style={styles.recordCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.recordBadge}>{record.recordType}</Text>
                  <TouchableOpacity
                    onPress={() => deleteMedicalRecord(record.id)}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.recordTitle}>{record.title}</Text>
                {record.recordDate && (
                  <Text style={styles.recordDate}>{record.recordDate}</Text>
                )}
                <Text style={styles.recordBody}>{record.content}</Text>
              </Card>
            ))}

            <TouchableOpacity
              style={styles.addRecordBtn}
              onPress={() => setShowRecordForm((prev) => !prev)}
            >
              <Text style={styles.addRecordBtnText}>
                {showRecordForm ? "Cancel" : "Add Record"}
              </Text>
            </TouchableOpacity>

            {showRecordForm && (
              <Card style={styles.formCard}>
                <Text style={styles.formLabel}>Type</Text>
                <View style={styles.chipRow}>
                  {RECORD_TYPES.map((type) => {
                    const selected = type === recordType;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => setRecordType(type)}
                        style={[
                          styles.typeChip,
                          selected && styles.typeChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            selected && styles.typeChipTextActive,
                          ]}
                        >
                          {type}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.formLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g., Chest X-ray report"
                />

                <Text style={styles.formLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={recordDate}
                  onChangeText={setRecordDate}
                  placeholder="2026-03-14"
                />

                <View style={styles.contentLabelRow}>
                  <Text style={styles.formLabel}>Content</Text>
                  <TouchableOpacity
                    onPress={() => setShowImageSourceModal(true)}
                    style={styles.scanBtn}
                    disabled={ocrLoading}
                  >
                    <Text style={styles.scanBtnText}>
                      {ocrLoading ? "Extracting..." : "Scan"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.contentFieldWrap}>
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    value={content}
                    onChangeText={(v) => { setContent(v); if (ocrWarning) setOcrWarning(null); }}
                    placeholder="Clinical details, prescriptions, findings..."
                    multiline
                    editable={!ocrLoading}
                  />
                  {ocrLoading && (
                    <View style={styles.ocrOverlay}>
                      <ActivityIndicator color="#185FA5" />
                      <Text style={styles.ocrOverlayText}>
                        Extracting text...
                      </Text>
                    </View>
                  )}
                </View>
                {ocrWarning && (
                  <View style={styles.ocrWarnBox}>
                    <Text style={styles.ocrWarnText}>⚠ {ocrWarning}</Text>
                  </View>
                )}
                {recordError && (
                  <Text style={styles.recordError}>{recordError}</Text>
                )}
                <Button title="Save Record" onPress={addMedicalRecord} />
              </Card>
            )}
          </View>
        )}

        {activeTab === "notes" && (
          <View style={styles.sectionBlock}>
            {/* Header row */}
            <View style={styles.noteHeaderRow}>
              <Text style={styles.sectionTitle}>Nurse Notes</Text>
              <TouchableOpacity
                style={styles.addNoteBtn}
                onPress={() => {
                  setNoteText("");
                  setNoteLinkSession(null);
                  setNoteLinkRecord(null);
                  setShowNoteForm((v) => !v);
                }}
              >
                <Text style={styles.addNoteBtnText}>
                  {showNoteForm ? "Cancel" : "+ Add Note"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inline add-note form */}
            {showNoteForm && (
              <Card style={styles.noteFormCard}>
                <TextInput
                  style={styles.notesInput}
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Write visit notes, observations, medication reminders..."
                  multiline
                  autoFocus
                />

                {/* Link chip strip */}
                <View style={styles.noteLinkRow}>
                  {noteLinkSession ? (
                    <View style={styles.noteLinkChip}>
                      <Text style={styles.noteLinkChipText} numberOfLines={1}>
                        {(() => {
                          const s = sessions.find((s) => s.id === noteLinkSession);
                          return s ? `Screening · ${format(new Date(s.startedAt), "MMM d")}` : "Screening";
                        })()}
                      </Text>
                      <TouchableOpacity onPress={() => setNoteLinkSession(null)}>
                        <Text style={styles.noteLinkRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : noteLinkRecord !== null ? (
                    <View style={styles.noteLinkChip}>
                      <Text style={styles.noteLinkChipText} numberOfLines={1}>
                        {(() => {
                          const r = records.find((r) => r.id === noteLinkRecord);
                          return r ? `${r.recordType} · ${r.title}` : "Record";
                        })()}
                      </Text>
                      <TouchableOpacity onPress={() => setNoteLinkRecord(null)}>
                        <Text style={styles.noteLinkRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.linkPickerBtn}
                      onPress={() => setShowNoteLinkSheet(true)}
                    >
                      <Text style={styles.linkPickerBtnText}>Link to screening or record</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Button
                  title={noteSaving ? "Saving..." : "Save Note"}
                  onPress={addNote}
                  disabled={noteSaving || !noteText.trim()}
                />
              </Card>
            )}

            {/* Note list */}
            {notes.length === 0 && !showNoteForm && (
              <Text style={styles.emptySectionText}>No notes yet. Tap "+ Add Note" to start.</Text>
            )}
            {notes.map((note) => {
              const linkedSession = note.linkedSessionId
                ? sessions.find((s) => s.id === note.linkedSessionId)
                : null;
              const linkedRecord = note.linkedRecordId !== undefined
                ? records.find((r) => r.id === note.linkedRecordId)
                : null;
              return (
                <Card key={note.id} style={styles.noteCard}>
                  <View style={styles.noteCardHeader}>
                    <Text style={styles.noteDate}>
                      {format(new Date(note.createdAt), "MMM d, h:mm a")}
                    </Text>
                    <TouchableOpacity onPress={() => deleteNote(note.id)}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.noteBody}>{note.text}</Text>
                  {linkedSession && (
                    <View style={styles.noteLinkBadge}>
                      <Text style={styles.noteLinkBadgeLabel}>Screening</Text>
                      <Text style={styles.noteLinkBadgeValue}>
                        {format(new Date(linkedSession.startedAt), "MMM d, h:mm a")}
                        {linkedSession.cnnOutput && ` · ${linkedSession.cnnOutput.pneumoniaRiskBucket} risk`}
                      </Text>
                    </View>
                  )}
                  {linkedRecord && (
                    <View style={styles.noteLinkBadge}>
                      <Text style={styles.noteLinkBadgeLabel}>{linkedRecord.recordType}</Text>
                      <Text style={styles.noteLinkBadgeValue}>{linkedRecord.title}</Text>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Link-to picker sheet */}
      <Modal
        visible={showNoteLinkSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNoteLinkSheet(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowNoteLinkSheet(false)}
        >
          <View style={[styles.modalSheet, styles.linkSheetTall]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Link note to…</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {sessions.length > 0 && (
                <>
                  <Text style={styles.linkSheetSection}>Screening sessions</Text>
                  {sessions.slice(0, 8).map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.linkSheetRow}
                      onPress={() => {
                        setNoteLinkSession(s.id);
                        setNoteLinkRecord(null);
                        setShowNoteLinkSheet(false);
                      }}
                    >
                      <View style={styles.linkSheetRowInner}>
                        <Text style={styles.linkSheetRowTitle}>
                          {format(new Date(s.startedAt), "MMM d, yyyy · h:mm a")}
                        </Text>
                        {s.cnnOutput && (
                          <Text style={styles.linkSheetRowSub}>
                            {s.cnnOutput.pneumoniaRiskBucket} risk · confidence {(s.cnnOutput.confidence * 100).toFixed(0)}%
                          </Text>
                        )}
                      </View>
                      {s.cnnOutput && <RiskBadge risk={s.cnnOutput.pneumoniaRiskBucket} />}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {records.length > 0 && (
                <>
                  <Text style={styles.linkSheetSection}>Medical records</Text>
                  {records.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.linkSheetRow}
                      onPress={() => {
                        setNoteLinkRecord(r.id);
                        setNoteLinkSession(null);
                        setShowNoteLinkSheet(false);
                      }}
                    >
                      <View style={styles.linkSheetRowInner}>
                        <Text style={styles.linkSheetRowTitle}>{r.title}</Text>
                        <Text style={styles.linkSheetRowSub}>{r.recordType}{r.recordDate ? ` · ${r.recordDate}` : ""}</Text>
                      </View>
                      <Text style={styles.recordBadge}>{r.recordType}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {sessions.length === 0 && records.length === 0 && (
                <Text style={styles.emptySectionText}>
                  No screenings or records to link to yet.
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowNoteLinkSheet(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showImageSourceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowImageSourceModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowImageSourceModal(false)}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Scan Medical Document</Text>
            <Text style={styles.modalSubtitle}>
              Take a photo or choose an image to extract text automatically.
            </Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleTakePhoto}
            >
              <Text style={styles.modalOptionText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleChooseFromLibrary}
            >
              <Text style={styles.modalOptionText}>Choose from Library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowImageSourceModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  quickActions: { gap: 8 },
  quickActionBtn: { width: "100%" },
  emptyText: {
    marginTop: 30,
    textAlign: "center",
    color: colors.text.secondary,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text.primary },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryText: { color: colors.text.secondary, fontSize: 13, lineHeight: 19 },
  tabRow: { flexDirection: "row", gap: 8 },
  tabChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(4,44,83,0.2)",
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabChipActive: {
    backgroundColor: colors.palette.primaryBlue,
    borderColor: "rgba(255,255,255,0.5)",
  },
  tabChipText: { fontSize: 12, fontWeight: "600", color: colors.text.primary },
  tabChipTextActive: { color: "#FFFFFF" },
  sectionBlock: { gap: 8 },
  emptySectionText: { color: colors.text.secondary, fontSize: 14 },
  sessionTouch: { minHeight: 56 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sessionDate: { fontSize: 13, fontWeight: "600", color: colors.text.primary },
  recordCard: { gap: 0 },
  recordBadge: {
    textTransform: "uppercase",
    fontSize: 11,
    color: "#185FA5",
    fontWeight: "700",
    backgroundColor: "rgba(24,95,165,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  deleteText: { color: "#D85A30", fontSize: 12, fontWeight: "600" },
  recordTitle: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
  },
  recordDate: { color: colors.text.secondary, fontSize: 12, marginTop: 4 },
  recordBody: {
    color: colors.text.primary,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 19,
  },
  addRecordBtn: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.palette.primaryBlue,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  addRecordBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  formCard: { marginBottom: 4 },
  formLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 6,
    marginTop: 8,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeChipActive: {
    borderColor: "#185FA5",
    backgroundColor: "rgba(24,95,165,0.1)",
  },
  typeChipText: { fontSize: 11, color: "#334155", fontWeight: "600" },
  typeChipTextActive: { color: "#185FA5" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  multilineInput: { minHeight: 96, textAlignVertical: "top" },
  contentLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    marginTop: 8,
  },
  scanBtn: {
    backgroundColor: "rgba(24,95,165,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(24,95,165,0.25)",
  },
  scanBtnText: { color: "#185FA5", fontSize: 12, fontWeight: "600" },
  contentFieldWrap: { position: "relative" },
  ocrOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ocrOverlayText: { color: "#185FA5", fontSize: 13, fontWeight: "600" },
  ocrWarnBox: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: "rgba(217,119,6,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.3)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ocrWarnText: {
    color: "#92400E",
    fontSize: 12,
    lineHeight: 17,
  },
  recordError: {
    color: "#D85A30",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  notesInput: {
    minHeight: 100,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
    backgroundColor: "#FFFFFF",
    textAlignVertical: "top",
  },
  noteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addNoteBtn: {
    backgroundColor: colors.palette.primaryBlue,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addNoteBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  noteFormCard: { gap: 0 },
  noteLinkRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  noteLinkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(24,95,165,0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(24,95,165,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: "85%",
  },
  noteLinkChipText: { color: "#185FA5", fontSize: 12, fontWeight: "600", flex: 1 },
  noteLinkRemove: { color: "#185FA5", fontSize: 13, fontWeight: "700" },
  linkPickerBtn: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderStyle: "dashed",
  },
  linkPickerBtnText: { color: colors.text.secondary, fontSize: 12, fontWeight: "500" },
  noteCard: { gap: 0 },
  noteCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  noteDate: { fontSize: 11, color: colors.text.muted, fontWeight: "500" },
  noteBody: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  noteLinkBadge: {
    marginTop: 10,
    backgroundColor: "rgba(24,95,165,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(24,95,165,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteLinkBadgeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#185FA5",
    textTransform: "uppercase",
  },
  noteLinkBadgeValue: {
    fontSize: 12,
    color: colors.text.secondary,
    flex: 1,
  },
  linkSheetTall: { maxHeight: "75%" },
  linkSheetSection: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  linkSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 8,
  },
  linkSheetRowInner: { flex: 1 },
  linkSheetRowTitle: { fontSize: 13, fontWeight: "600", color: colors.text.primary },
  linkSheetRowSub: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 20,
    lineHeight: 18,
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalOptionText: { fontSize: 15, fontWeight: "600", color: "#111827" },
  modalCancel: { marginTop: 16, alignItems: "center", paddingVertical: 12 },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: "#6B7280" },
});
