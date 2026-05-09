import { DrawerNavigationProp } from "@react-navigation/drawer";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import SignatureScreen, {
    SignatureViewRef,
} from "react-native-signature-canvas";
import Toast from "react-native-toast-message";

// ─── Types ───────────────────────────────────────────────────────────────────

type RootParamList = {
  FSRScreen: { jobId: number | string };
  JobOrders: undefined;
};

type FSRRouteProp = RouteProp<RootParamList, "FSRScreen">;
type FSRNavProp = DrawerNavigationProp<RootParamList>;

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVER_BASE = "https://app.sowashusa.com";

const BG = "#080C18";
const SURFACE = "#0D1120";
const SURFACE2 = "#131929";
const ACCENT = "#3B82F6";
const ACCENT2 = "#22D3A5";
const TEXT = "#F0F4FF";
const TEXT_DIM = "#6B7A99";
const BORDER = "#1E2A45";
const ERROR = "#F87171";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getToken = () => SecureStore.getItemAsync("userToken");

// ─── Component ───────────────────────────────────────────────────────────────

export default function FSRScreen() {
  const navigation = useNavigation<FSRNavProp>();
  const route = useRoute<FSRRouteProp>();
  const { jobId } = route.params;

  const sigRef = useRef<SignatureViewRef>(null);

  const [panelsCleaned, setPanelsCleaned] = useState("0");
  const [observations, setObservations] = useState("");
  const [workDone, setWorkDone] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [sigPadActive, setSigPadActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Stepper helpers ────────────────────────────────────────────────────────

  const incrementPanels = () =>
    setPanelsCleaned((v) => String(Math.max(0, parseInt(v || "0") + 1)));
  const decrementPanels = () =>
    setPanelsCleaned((v) => String(Math.max(0, parseInt(v || "0") - 1)));

  // ── Signature callbacks ────────────────────────────────────────────────────

  const handleSignatureOK = (sig: string) => {
    setSignatureData(sig);
    setSigPadActive(false);
  };

  const handleClearSignature = () => {
    sigRef.current?.clearSignature();
    setSignatureData(null);
  };

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!panelsCleaned || parseInt(panelsCleaned) < 0)
      return "Enter panels cleaned count.";
    if (!observations.trim()) return "General observations cannot be empty.";
    if (!workDone.trim()) return "Work done summary cannot be empty.";
    if (!signatureData) return "Please provide a signature before submitting.";
    return null;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      Toast.show({ type: "error", text1: "Incomplete Form", text2: err });
      return;
    }

    const performedAt = new Date().toISOString();
    setSubmitting(true);

    try {
      const token = await getToken();

      // 1. POST FSR as multipart/form-data — RN native networking handles data: URIs as file uploads
      const form = new FormData();
      form.append("signature", { uri: signatureData!, type: "image/png", name: "signature.png" } as any);
      form.append("panels_cleaned", String(parseInt(panelsCleaned)));
      form.append("observations", observations.trim());
      form.append("work_done", workDone.trim());
      form.append("submitted_at", performedAt);

      const fsrRes = await fetch(`${SERVER_BASE}/api/mideast/fsrs/job/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type — fetch sets multipart boundary automatically
        body: form,
      });

      if (!fsrRes.ok) {
        const body = await fsrRes.json().catch(() => ({}));
        throw new Error(body?.error || `FSR submit failed (${fsrRes.status})`);
      }

      // 3. PATCH site_exited — writes GPS/timestamp columns (backend FSR route already sets status=completed)
      //    Fire and forget — don't block navigation on this
      fetch(`${SERVER_BASE}/api/mideast/jobs/${jobId}/event`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event: "site_exited", timestamp: performedAt, lat: null, lng: null }),
      }).catch(() => {});

      Toast.show({ type: "success", text1: "Job Completed!", text2: "FSR submitted successfully." });
      navigation.navigate("JobOrders");
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Submission Failed",
        text2: e?.message ?? "Check connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                "Go Back?",
                "Unsaved progress will be lost.",
                [
                  { text: "Stay", style: "cancel" },
                  { text: "Go Back", style: "destructive", onPress: () => navigation.goBack() },
                ]
              );
            }}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerLabel}>FIELD SERVICE REPORT</Text>
            <Text style={styles.headerSub}>Job #{jobId}</Text>
          </View>
          {/* spacer */}
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Panels Cleaned ── */}
          <Section label="PANELS CLEANED" required>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepperBtn} onPress={decrementPanels}>
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.stepperInput}
                value={panelsCleaned}
                onChangeText={(v) => {
                  const n = v.replace(/[^0-9]/g, "");
                  setPanelsCleaned(n);
                }}
                keyboardType="number-pad"
                maxLength={4}
                selectTextOnFocus
              />
              <TouchableOpacity style={styles.stepperBtn} onPress={incrementPanels}>
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </Section>

          {/* ── General Observations ── */}
          <Section label="GENERAL OBSERVATIONS" required>
            <TextInput
              style={styles.textArea}
              value={observations}
              onChangeText={setObservations}
              placeholder="Describe site conditions, issues noticed, panel state…"
              placeholderTextColor={TEXT_DIM}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </Section>

          {/* ── Work Done ── */}
          <Section label="WORK DONE" required>
            <TextInput
              style={styles.textArea}
              value={workDone}
              onChangeText={setWorkDone}
              placeholder="Summarise the cleaning and maintenance work performed…"
              placeholderTextColor={TEXT_DIM}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </Section>

          {/* ── Signature ── */}
          <Section label="FIELD OPERATOR SIGNATURE" required>
            {signatureData ? (
              <View style={styles.sigDone}>
                <Text style={styles.sigDoneText}>✓ Signature captured</Text>
                <TouchableOpacity onPress={handleClearSignature}>
                  <Text style={styles.sigRetake}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.sigHint}>
                  Draw your signature in the box below, then tap{" "}
                  <Text style={{ color: ACCENT2 }}>Done</Text>.
                </Text>
                <View style={styles.sigContainer}>
                  <SignatureScreen
                    ref={sigRef}
                    onOK={handleSignatureOK}
                    onBegin={() => setSigPadActive(true)}
                    penColor="#22D3A5"
                    backgroundColor={SURFACE2}
                    style={styles.sigPad}
                    webStyle={sigWebStyle}
                    descriptionText=""
                    clearText="Clear"
                    confirmText="Done"
                    trimWhitespace={true}
                  />
                </View>
              </>
            )}
          </Section>

          {/* ── Submit ── */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>SUBMIT & COMPLETE JOB</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function Section({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {required && <Text style={styles.requiredDot}>*</Text>}
      </View>
      {children}
    </View>
  );
}

// ─── Signature web style (injected into WebView) ──────────────────────────────

const sigWebStyle = `
  .m-signature-pad {
    border: none;
    margin: 0;
    box-shadow: none;
  }
  .m-signature-pad--body {
    border: none;
  }
  .m-signature-pad--footer {
    background: #0D1120;
    padding: 8px 12px;
  }
  .m-signature-pad--footer .button {
    background: transparent;
    border: 1px solid #1E2A45;
    color: #6B7A99;
    border-radius: 6px;
    font-size: 13px;
    padding: 6px 16px;
  }
  .m-signature-pad--footer .button.save {
    background: #22D3A5;
    border-color: #22D3A5;
    color: #080C18;
    font-weight: 700;
  }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingTop: Platform.OS === "ios" ? 52 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 36,
    alignItems: "center",
  },
  backArrow: {
    fontSize: 22,
    color: TEXT,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: ACCENT2,
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 11,
    color: TEXT_DIM,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 8,
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_DIM,
    letterSpacing: 1.5,
  },
  requiredDot: {
    color: ACCENT,
    fontSize: 14,
    marginLeft: 3,
    lineHeight: 16,
  },

  // Stepper
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  stepperBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE2,
  },
  stepperBtnText: {
    fontSize: 22,
    color: ACCENT2,
    fontWeight: "300",
  },
  stepperInput: {
    width: 80,
    height: 52,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    color: TEXT,
    backgroundColor: SURFACE,
  },

  // TextArea
  textArea: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 14,
    color: TEXT,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 110,
  },

  // Signature
  sigHint: {
    fontSize: 12,
    color: TEXT_DIM,
    marginBottom: 10,
    lineHeight: 18,
  },
  sigContainer: {
    height: 240,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE2,
  },
  sigPad: {
    flex: 1,
  },
  sigDone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0B1F17",
    borderWidth: 1,
    borderColor: "#22D3A540",
    borderRadius: 10,
    padding: 16,
  },
  sigDoneText: {
    color: ACCENT2,
    fontSize: 14,
    fontWeight: "600",
  },
  sigRetake: {
    color: TEXT_DIM,
    fontSize: 13,
    textDecorationLine: "underline",
  },

  // Submit
  submitBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 12,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
});