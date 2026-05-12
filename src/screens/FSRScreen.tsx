import { DrawerNavigationProp } from "@react-navigation/drawer";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import * as SecureStore from "expo-secure-store";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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

type RootParamList = {
  FSRScreen: { jobId: number | string };
  JobOrders: undefined;
};
type FSRRouteProp = RouteProp<RootParamList, "FSRScreen">;
type FSRNavProp = DrawerNavigationProp<RootParamList>;

const SERVER_BASE = "https://app.sowashusa.com";
const BG       = "#080C18";
const SURFACE  = "#0D1120";
const SURFACE2 = "#131929";
const ACCENT   = "#3B82F6";
const ACCENT2  = "#22D3A5";
const TEXT     = "#F0F4FF";
const TEXT_DIM = "#6B7A99";
const BORDER   = "#1E2A45";
const DANGER   = "#EF4444";
const WARNING  = "#F59E0B";

const getToken = () => SecureStore.getItemAsync("userToken");

// ─── Good/Bad or Yes/No Toggle ───────────────────────────────────────────────

function Toggle<T extends string>({
  options,
  value,
  onChange,
  activeColors,
}: {
  options: T[];
  value: T | null;
  onChange: (v: T) => void;
  activeColors?: string[];
}) {
  return (
    <View style={tog.row}>
      {options.map((opt, i) => {
        const isActive = value === opt;
        const activeColor = activeColors?.[i] ?? ACCENT2;
        return (
          <TouchableOpacity
            key={opt}
            style={[
              tog.btn,
              isActive && { borderColor: activeColor, backgroundColor: activeColor + "18" },
            ]}
            onPress={() => onChange(opt)}
          >
            <Text style={[tog.label, isActive && { color: TEXT }]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tog = StyleSheet.create({
  row:   { flexDirection: "row", gap: 8 },
  btn:   { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 8, backgroundColor: SURFACE2, borderWidth: 1, borderColor: BORDER },
  label: { fontSize: 14, fontWeight: "700", color: TEXT_DIM },
});

// ─── Checkbox Row ─────────────────────────────────────────────────────────────

function CheckRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity
      style={[chk.row, value && chk.rowActive]}
      onPress={() => onChange(!value)}
      activeOpacity={0.8}
    >
      <View style={[chk.box, value && chk.boxActive]}>
        {value && <Text style={chk.tick}>✓</Text>}
      </View>
      <Text style={[chk.label, value && chk.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chk = StyleSheet.create({
  row:         { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: SURFACE2, borderRadius: 10, borderWidth: 1, borderColor: BORDER, marginBottom: 8 },
  rowActive:   { borderColor: WARNING, backgroundColor: "rgba(245,158,11,0.08)" },
  box:         { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: BORDER, justifyContent: "center", alignItems: "center" },
  boxActive:   { backgroundColor: WARNING, borderColor: WARNING },
  tick:        { fontSize: 13, fontWeight: "900", color: BG },
  label:       { fontSize: 14, color: TEXT_DIM, flex: 1 },
  labelActive: { color: TEXT, fontWeight: "600" },
});

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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

const sigWebStyle = `
  .m-signature-pad { border:none; margin:0; box-shadow:none; }
  .m-signature-pad--body { border:none; }
  .m-signature-pad--footer { display:none; }
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FSRScreen() {
  const navigation = useNavigation<FSRNavProp>();
  const route = useRoute<FSRRouteProp>();
  const { jobId } = route.params;
  const sigRef = useRef<SignatureViewRef>(null);

  const [panelsCleaned,    setPanelsCleaned]    = useState("0");
  const [observations,     setObservations]     = useState("");
  const [workDone,         setWorkDone]         = useState("");
  const [cableCondition,   setCableCondition]   = useState<"Good" | "Bad" | null>(null);
  const [cableQuantity,    setCableQuantity]    = useState("");
  const [panelDamage,      setPanelDamage]      = useState<"Yes" | "No" | null>(null);
  const [panelBrand,       setPanelBrand]       = useState("");
  const [inverterAlarm,    setInverterAlarm]    = useState<"Yes" | "No" | null>(null);
  const [alarmCode,        setAlarmCode]        = useState("");
  const [potentialShading, setPotentialShading] = useState<"Yes" | "No" | null>(null);
  const [shadingDetails,   setShadingDetails]   = useState("");
  const [rusting,          setRusting]          = useState(false);
  const [birdDrop,         setBirdDrop]         = useState(false);
  const [mosDebris,        setMosDebris]        = useState(false);
  const [earthing,         setEarthing]         = useState(false);
  const [signatureData,    setSignatureData]    = useState<string | null>(null);
  const [sigModalVisible,  setSigModalVisible]  = useState(false);
  const [submitting,       setSubmitting]       = useState(false);

  const inc = () => setPanelsCleaned(v => String(Math.max(0, parseInt(v || "0") + 1)));
  const dec = () => setPanelsCleaned(v => String(Math.max(0, parseInt(v || "0") - 1)));

  const validate = (): string | null => {
    if (!cableCondition)    return "Select cable condition.";
    if (!panelDamage)       return "Indicate if there is panel damage.";
    if (!inverterAlarm)     return "Indicate inverter alarm status.";
    if (!potentialShading)  return "Indicate potential shading.";
    if (!observations.trim()) return "General observations cannot be empty.";
    if (!workDone.trim())     return "Work done summary cannot be empty.";
    if (!signatureData)       return "Please provide a signature before submitting.";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { Toast.show({ type: "error", text1: "Incomplete Form", text2: err }); return; }

    const performedAt = new Date().toISOString();
    setSubmitting(true);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("signature",        { uri: signatureData!, type: "image/png", name: "signature.png" } as any);
      form.append("panels_cleaned",   String(parseInt(panelsCleaned)));
      form.append("observations",     observations.trim());
      form.append("work_done",        workDone.trim());
      form.append("submitted_at",     performedAt);
      form.append("cable_condition",  cableCondition ?? "");
      form.append("cable_quantity",   cableQuantity.trim());
      form.append("panel_damage",     panelDamage ?? "");
      form.append("panel_brand",      panelBrand.trim());
      form.append("inverter_alarm",   inverterAlarm ?? "");
      form.append("alarm_code",       alarmCode.trim());
      form.append("potential_shading",potentialShading ?? "");
      form.append("shading_details",  shadingDetails.trim());
      form.append("rusting",          String(rusting));
      form.append("bird_dropping",    String(birdDrop));
      form.append("mos_and_debris",   String(mosDebris));
      form.append("earthing",         String(earthing));

      const fsrRes = await fetch(`${SERVER_BASE}/api/mideast/fsrs/job/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!fsrRes.ok) {
        const body = await fsrRes.json().catch(() => ({}));
        throw new Error(body?.error || `FSR submit failed (${fsrRes.status})`);
      }

      // Fire-and-forget: write site_exited GPS/timestamp columns
      fetch(`${SERVER_BASE}/api/mideast/jobs/${jobId}/event`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event: "site_exited", timestamp: performedAt, lat: null, lng: null }),
      }).catch(() => {});

      Toast.show({ type: "success", text1: "Job Completed!", text2: "FSR submitted successfully." });
      navigation.navigate("JobOrders");
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Submission Failed", text2: e?.message ?? "Check connection and try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.root}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => Alert.alert("Go Back?", "Unsaved progress will be lost.", [
              { text: "Stay", style: "cancel" },
              { text: "Go Back", style: "destructive", onPress: () => navigation.goBack() },
            ])}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerLabel}>FIELD SERVICE REPORT</Text>
            <Text style={styles.headerSub}>Job #{jobId}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Panels Cleaned */}
          <Section label="PANELS CLEANED" required>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepperBtn} onPress={dec}><Text style={styles.stepperBtnText}>−</Text></TouchableOpacity>
              <TextInput style={styles.stepperInput} value={panelsCleaned} onChangeText={v => setPanelsCleaned(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" maxLength={4} selectTextOnFocus />
              <TouchableOpacity style={styles.stepperBtn} onPress={inc}><Text style={styles.stepperBtnText}>+</Text></TouchableOpacity>
            </View>
          </Section>

          {/* Cable */}
          <Section label="CABLE CONDITION" required>
            <Toggle options={["Good", "Bad"] as const} value={cableCondition} onChange={setCableCondition} activeColors={[ACCENT2, DANGER]} />
          </Section>

          <Section label="CABLE QUANTITY">
            <TextInput style={styles.input} value={cableQuantity} onChangeText={setCableQuantity} placeholder="e.g. 50 meters" placeholderTextColor={TEXT_DIM} />
          </Section>

          {/* Panel */}
          <Section label="PANEL DAMAGE" required>
            <Toggle options={["Yes", "No"] as const} value={panelDamage} onChange={setPanelDamage} activeColors={[DANGER, ACCENT2]} />
          </Section>

          <Section label="PANEL BRAND">
            <TextInput style={styles.input} value={panelBrand} onChangeText={setPanelBrand} placeholder="e.g. Canadian Solar" placeholderTextColor={TEXT_DIM} />
          </Section>

          {/* Inverter */}
          <Section label="INVERTER ALARM" required>
            <Toggle options={["Yes", "No"] as const} value={inverterAlarm} onChange={setInverterAlarm} activeColors={[DANGER, ACCENT2]} />
          </Section>

          {inverterAlarm === "Yes" && (
            <Section label="ALARM CODE">
              <TextInput style={styles.input} value={alarmCode} onChangeText={setAlarmCode} placeholder="Enter alarm code" placeholderTextColor={TEXT_DIM} />
            </Section>
          )}

          {/* Shading */}
          <Section label="POTENTIAL SHADING" required>
            <Toggle options={["Yes", "No"] as const} value={potentialShading} onChange={setPotentialShading} activeColors={[WARNING, ACCENT2]} />
          </Section>

          {potentialShading === "Yes" && (
            <Section label="SHADING DETAILS">
              <TextInput style={styles.textArea} value={shadingDetails} onChangeText={setShadingDetails} placeholder="Describe the shading source…" placeholderTextColor={TEXT_DIM} multiline numberOfLines={3} textAlignVertical="top" />
            </Section>
          )}

          {/* Site Conditions */}
          <Section label="SITE CONDITIONS">
            <CheckRow label="Rusting observed"      value={rusting}   onChange={setRusting}   />
            <CheckRow label="Bird dropping present" value={birdDrop}  onChange={setBirdDrop}  />
            <CheckRow label="Moss & debris present" value={mosDebris} onChange={setMosDebris} />
            <CheckRow label="Earthing in place"     value={earthing}  onChange={setEarthing}  />
          </Section>

          {/* Observations */}
          <Section label="GENERAL OBSERVATIONS" required>
            <TextInput style={styles.textArea} value={observations} onChangeText={setObservations} placeholder="Describe site conditions, issues noticed, panel state…" placeholderTextColor={TEXT_DIM} multiline numberOfLines={4} textAlignVertical="top" />
          </Section>

          {/* Work Done */}
          <Section label="WORK DONE" required>
            <TextInput style={styles.textArea} value={workDone} onChangeText={setWorkDone} placeholder="Summarise the cleaning and maintenance work performed…" placeholderTextColor={TEXT_DIM} multiline numberOfLines={4} textAlignVertical="top" />
          </Section>

          {/* Signature */}
          <Section label="FIELD OPERATOR SIGNATURE" required>
            {signatureData ? (
              <View style={styles.sigDone}>
                <Text style={styles.sigDoneText}>✓ Signature captured</Text>
                <TouchableOpacity onPress={() => { sigRef.current?.clearSignature(); setSignatureData(null); }}>
                  <Text style={styles.sigRetake}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.sigOpenBtn} onPress={() => setSigModalVisible(true)}>
                <Text style={styles.sigOpenText}>✎  Tap to Sign</Text>
              </TouchableOpacity>
            )}
          </Section>

          {/* Submit */}
          <TouchableOpacity style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>SUBMIT & COMPLETE JOB</Text>}
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>

      {/* Signature Modal */}
      <Modal visible={sigModalVisible} animationType="slide" transparent={false} onRequestClose={() => setSigModalVisible(false)}>
        <View style={styles.sigModal}>
          <View style={styles.sigModalHeader}>
            <Text style={styles.sigModalTitle}>FIELD OPERATOR SIGNATURE</Text>
            <TouchableOpacity onPress={() => setSigModalVisible(false)}>
              <Text style={styles.sigModalCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sigHint}>Sign in the box below.</Text>
          <View style={styles.sigContainer}>
            <SignatureScreen ref={sigRef} onOK={sig => { setSignatureData(sig); setSigModalVisible(false); }} penColor="#22D3A5" backgroundColor="#FFFFFF" style={styles.sigPad} webStyle={sigWebStyle} descriptionText="" clearText=" " confirmText=" " trimWhitespace />
          </View>
          <View style={styles.sigActions}>
            <TouchableOpacity style={styles.sigClearBtn} onPress={() => sigRef.current?.clearSignature()}>
              <Text style={styles.sigClearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sigDoneBtn} onPress={() => sigRef.current?.readSignature()}>
              <Text style={styles.sigDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: BG },

  header:       { flexDirection: "row", alignItems: "center", backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER, paddingTop: Platform.OS === "ios" ? 52 : 16, paddingBottom: 14, paddingHorizontal: 16 },
  backBtn:      { width: 36, alignItems: "center" },
  backArrow:    { fontSize: 22, color: TEXT },
  headerCenter: { flex: 1, alignItems: "center" },
  headerLabel:  { fontSize: 13, fontWeight: "700", color: ACCENT2, letterSpacing: 2 },
  headerSub:    { fontSize: 11, color: TEXT_DIM, marginTop: 2, letterSpacing: 0.5 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

  section:         { marginBottom: 20 },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionLabel:    { fontSize: 11, fontWeight: "700", color: TEXT_DIM, letterSpacing: 1.5 },
  requiredDot:     { color: ACCENT, fontSize: 14, marginLeft: 3, lineHeight: 16 },

  stepper:        { flexDirection: "row", alignItems: "center", backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: "hidden", alignSelf: "flex-start" },
  stepperBtn:     { width: 52, height: 52, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE2 },
  stepperBtnText: { fontSize: 22, color: ACCENT2, fontWeight: "300" },
  stepperInput:   { width: 80, height: 52, textAlign: "center", fontSize: 24, fontWeight: "700", color: TEXT, backgroundColor: SURFACE },

  input:    { backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 14, color: TEXT, fontSize: 14 },
  textArea: { backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 14, color: TEXT, fontSize: 14, lineHeight: 21, minHeight: 110 },

  sigOpenBtn:  { backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 18, alignItems: "center", borderStyle: "dashed" },
  sigOpenText: { color: ACCENT2, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  sigDone:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0B1F17", borderWidth: 1, borderColor: "#22D3A540", borderRadius: 10, padding: 16 },
  sigDoneText: { color: ACCENT2, fontSize: 14, fontWeight: "600" },
  sigRetake:   { color: TEXT_DIM, fontSize: 13, textDecorationLine: "underline" },

  sigModal:        { flex: 1, backgroundColor: BG, padding: 16, paddingTop: Platform.OS === "ios" ? 52 : 24 },
  sigModalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sigModalTitle:   { fontSize: 13, fontWeight: "700", color: ACCENT2, letterSpacing: 1.5 },
  sigModalCancel:  { fontSize: 14, color: TEXT_DIM },
  sigHint:         { fontSize: 12, color: TEXT_DIM, marginBottom: 10 },
  sigContainer:    { flex: 1, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: BORDER },
  sigPad:          { flex: 1 },
  sigActions:      { flexDirection: "row", gap: 10, marginTop: 12 },
  sigClearBtn:     { flex: 1, paddingVertical: 14, alignItems: "center", backgroundColor: SURFACE2, borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  sigClearText:    { color: TEXT_DIM, fontWeight: "700", fontSize: 14 },
  sigDoneBtn:      { flex: 2, paddingVertical: 14, alignItems: "center", backgroundColor: ACCENT2, borderRadius: 10 },
  sigDoneBtnText:  { color: BG, fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },

  submitBtn:         { backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 17, alignItems: "center", marginTop: 12, elevation: 6 },
  submitBtnDisabled: { opacity: 0.6 },
  submitText:        { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 1.5 },
});