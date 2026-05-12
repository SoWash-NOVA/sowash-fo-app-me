import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

const PIN_SIZE = 40;
const TABS = ["BEFORE", "ANNOTATE", "AFTER"] as const;
type Tab = (typeof TABS)[number];

export const SERVER_BASE = "https://app.sowashusa.com";

const STATUS_TO_STEP: Record<string, number> = {
  scheduled: -1,
  in_progress: -1,
  reached_site: 0,
  reached_panels: 1,
  work_started: 2,
  work_finished: 3,
  completed: 4,
};

const EVENT_TO_STEP: Record<string, number> = {
  reached_site: 0,
  reached_panels: 1,
  work_started: 2,
  work_finished: 3,
  site_exited: 4,
};

const STEP_DEFS = [
  { key: "reached_site",   label: "Reached\nSite",   icon: "location-outline"         },
  { key: "reached_panels", label: "At\nPanels",      icon: "grid-outline"             },
  { key: "work_started",   label: "Work\nStarted",   icon: "play-circle-outline"      },
  { key: "work_finished",  label: "Work\nFinished",  icon: "checkmark-circle-outline" },
  { key: "site_exited",    label: "Site\nExited",    icon: "exit-outline"             },
] as const;

type Point = { id: number; label?: string; x_percent: number; y_percent: number };

type PinStatus = {
  beforeUri?: string;       beforeUploaded: boolean;  beforePerformedAt?: string;
  annotationSaved: boolean;
  afterUri?: string;        afterUploaded: boolean;   afterPerformedAt?: string;
};

export default function SLDMapScreen({ navigation, route }: any) {
  const { jobId, diagram } = route.params || {};
  const points: Point[] = diagram?.points ?? [];
  const imageUrl = diagram?.diagram_url ? `${SERVER_BASE}${diagram.diagram_url}` : null;

  const [containerLayout, setContainerLayout] = useState({ width: 1, height: 1 });
  const [imageNatural, setImageNatural]       = useState({ width: 1, height: 1 });
  const [imageLoading, setImageLoading]       = useState(true);

  const [jobStep,     setJobStep]     = useState(-1);
  const [stepLoading, setStepLoading] = useState(true);
  const [firingEvent, setFiringEvent] = useState(false);
  const workStartedFired  = useRef(false);
  const workFinishedFired = useRef(false);

  // ── TPT Photo ─────────────────────────────────────────────────────────────
  const [tptUploaded,    setTptUploaded]    = useState(false);
  const [tptUri,         setTptUri]         = useState<string | null>(null);
  const [showTptCamera,  setShowTptCamera]  = useState(false);
  const [tptUploading,   setTptUploading]   = useState(false);
  const tptCameraRef = useRef<CameraView>(null);

  const [pinStatuses, setPinStatuses] = useState<Record<number, PinStatus>>(() => {
    const initial: Record<number, PinStatus> = {};
    for (const p of (diagram?.points ?? []) as Point[]) {
      initial[p.id] = { beforeUploaded: false, annotationSaved: false, afterUploaded: false };
    }
    return initial;
  });

  const [selectedPin, setSelectedPin] = useState<Point | null>(null);
  const [activeTab,   setActiveTab]   = useState<Tab>("BEFORE");
  const [note,        setNote]        = useState("");
  const [flagged,     setFlagged]     = useState(false);
  const [saving,      setSaving]      = useState(false);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [showCamera,  setShowCamera]  = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"before" | "after">("before");
  const cameraRef = useRef<CameraView>(null);

  // ─── Mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadJobStep();
    loadExistingServerData();
  }, []);

  const loadJobStep = async () => {
    try {
      const token = await SecureStore.getItemAsync("userToken");
      const res = await fetch(`${SERVER_BASE}/api/mideast/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const status = data.job?.status ?? "scheduled";
      setJobStep(STATUS_TO_STEP[status] ?? -1);
      if (STATUS_TO_STEP[status] >= 2) workStartedFired.current = true;
      if (STATUS_TO_STEP[status] >= 3) workFinishedFired.current = true;
      // Restore TPT status
      if (data.job?.tpt_photo_url) setTptUploaded(true);
    } catch {
      Toast.show({ type: "error", text1: "Could not load job status." });
    } finally {
      setStepLoading(false);
    }
  };

  const loadExistingServerData = async () => {
    try {
      const token = await SecureStore.getItemAsync("userToken");
      const [photosRes, annotationsRes] = await Promise.all([
        fetch(`${SERVER_BASE}/api/mideast/point-photos/job/${jobId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${SERVER_BASE}/api/mideast/fo-annotations/job/${jobId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const photosData      = photosRes.ok      ? await photosRes.json()      : {};
      const annotationsData = annotationsRes.ok ? await annotationsRes.json() : {};
      const photos      = Array.isArray(photosData)      ? photosData      : (photosData.photos      ?? []);
      const annotations = Array.isArray(annotationsData) ? annotationsData : (annotationsData.annotations ?? []);
      setPinStatuses((prev) => {
        const next = { ...prev };
        for (const p of photos) {
          if (!next[p.point_id]) continue;
          p.photo_type === "before"
            ? (next[p.point_id] = { ...next[p.point_id], beforeUploaded: true })
            : (next[p.point_id] = { ...next[p.point_id], afterUploaded: true });
        }
        for (const a of annotations) {
          if (!next[a.point_id]) continue;
          next[a.point_id] = { ...next[a.point_id], annotationSaved: true };
        }
        return next;
      });
    } catch { /* best effort */ }
  };

  // ─── Auto work_started / work_finished ───────────────────────────────────

  useEffect(() => {
    if (jobStep < 1) return;
    const beforeCount = Object.values(pinStatuses).filter(s => s.beforeUploaded).length;
    if (beforeCount >= 1 && !workStartedFired.current && jobStep === 1) {
      workStartedFired.current = true;
      fireEvent("work_started");
    }
    const afterCount = Object.values(pinStatuses).filter(s => s.afterUploaded).length;
    if (afterCount === points.length && points.length > 0 && !workFinishedFired.current && jobStep === 2) {
      workFinishedFired.current = true;
      fireEvent("work_finished");
    }
  }, [pinStatuses, jobStep]);

  // ─── Fire event ───────────────────────────────────────────────────────────

  const fireEvent = async (eventKey: string) => {
    const performedAt = new Date().toISOString();
    setJobStep(EVENT_TO_STEP[eventKey]);
    const token = await SecureStore.getItemAsync("userToken");
    try {
      const res = await fetch(`${SERVER_BASE}/api/mideast/jobs/${jobId}/event`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event: eventKey, timestamp: performedAt, lat: null, lng: null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      Toast.show({ type: "error", text1: "Could not record event.", text2: "Check connection and try again." });
    }
  };

  const handleManualEvent = async (eventKey: string) => {
    if (eventKey === "site_exited") {
      navigation.navigate("FSRScreen", { jobId });
      return;
    }
    setFiringEvent(true);
    await fireEvent(eventKey);
    setFiringEvent(false);
  };

  // ─── TPT Photo ────────────────────────────────────────────────────────────

  const takeTptPicture = async () => {
    if (!tptCameraRef.current) return;
    try {
      const photo = await tptCameraRef.current.takePictureAsync({ quality: 0.75 });
      setTptUri(photo.uri);
    } catch {
      Toast.show({ type: "error", text1: "Camera Error" });
    }
  };

  const uploadTptPhoto = async () => {
    if (!tptUri) return;
    setTptUploading(true);
    const token = await SecureStore.getItemAsync("userToken");
    try {
      const form = new FormData();
      form.append("photo", { uri: tptUri, type: "image/jpeg", name: "tpt.jpg" } as any);
      form.append("taken_at", new Date().toISOString());
      const res = await fetch(`${SERVER_BASE}/api/mideast/jobs/${jobId}/tpt-photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTptUploaded(true);
      setShowTptCamera(false);
      setTptUri(null);
      Toast.show({ type: "success", text1: "TPT photo saved. Diagram unlocked." });
    } catch {
      Toast.show({ type: "error", text1: "Upload failed.", text2: "Check connection and try again." });
    } finally {
      setTptUploading(false);
    }
  };

  // ─── Pin helpers ──────────────────────────────────────────────────────────

  const getRenderedImageRect = useCallback(() => {
    const cA = containerLayout.width / containerLayout.height;
    const iA = imageNatural.width / imageNatural.height;
    let rW: number, rH: number, oX: number, oY: number;
    if (iA > cA) { rW = containerLayout.width; rH = rW / iA; oX = 0; oY = (containerLayout.height - rH) / 2; }
    else { rH = containerLayout.height; rW = rH * iA; oX = (containerLayout.width - rW) / 2; oY = 0; }
    return { rW, rH, oX, oY };
  }, [containerLayout, imageNatural]);

  const getPinStyle = (point: Point) => {
    const { rW, rH, oX, oY } = getRenderedImageRect();
    return {
      left: oX + (point.x_percent / 100) * rW - PIN_SIZE / 2,
      top:  oY + (point.y_percent / 100) * rH - PIN_SIZE / 2,
    };
  };

  // 3-state pin: empty | before | done
  const getPinState = (id: number): "empty" | "before" | "done" => {
    const s = pinStatuses[id];
    if (!s) return "empty";
    if (s.beforeUploaded && s.annotationSaved && s.afterUploaded) return "done";
    if (s.beforeUploaded) return "before";
    return "empty";
  };

  const pinDone = (id: number) => {
    const s = pinStatuses[id];
    return s?.beforeUploaded && s?.annotationSaved && s?.afterUploaded;
  };

  const doneCount  = points.filter((p) => pinDone(p.id)).length;
  // Pins locked until: reached_panels AND tpt uploaded
  const pinsLocked = jobStep < 1 || (jobStep === 1 && !tptUploaded);

  // ─── Modal ────────────────────────────────────────────────────────────────

  const openPin = (point: Point) => {
    if (pinsLocked) return;
    setSelectedPin(point); setActiveTab("BEFORE"); setNote(""); setFlagged(false); setShowCamera(false);
  };
  const closeModal = () => { setSelectedPin(null); setShowCamera(false); };

  // ─── Camera ───────────────────────────────────────────────────────────────

  const launchCamera = async (target: "before" | "after") => {
    if (!camPermission?.granted) {
      const result = await requestCamPermission();
      if (!result.granted) { Alert.alert("Permission Required", "Camera access is needed."); return; }
    }
    setCameraTarget(target); setShowCamera(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current || !selectedPin) return;
    const performedAt = new Date().toISOString();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
      setShowCamera(false);
      setPinStatuses((prev) => ({
        ...prev,
        [selectedPin.id]: {
          ...prev[selectedPin.id],
          ...(cameraTarget === "before"
            ? { beforeUri: photo.uri, beforePerformedAt: performedAt }
            : { afterUri: photo.uri,  afterPerformedAt: performedAt }),
        },
      }));
    } catch { Toast.show({ type: "error", text1: "Camera Error" }); }
  };

  // ─── Confirm photo ────────────────────────────────────────────────────────

  const confirmPhoto = async (type: "before" | "after") => {
    if (!selectedPin) return;
    const status      = pinStatuses[selectedPin.id];
    const uri         = type === "before" ? status?.beforeUri        : status?.afterUri;
    const performedAt = type === "before" ? status?.beforePerformedAt : status?.afterPerformedAt;
    if (!uri || !performedAt) return;
    setSaving(true);
    const token = await SecureStore.getItemAsync("userToken");
    try {
      const form = new FormData();
      form.append("photo", { uri, type: "image/jpeg", name: `${type}-${selectedPin.id}.jpg` } as any);
      form.append("point_id",   String(selectedPin.id));
      form.append("photo_type", type);
      form.append("taken_at",   performedAt);
      const res = await fetch(`${SERVER_BASE}/api/mideast/point-photos/job/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPinStatuses((prev) => ({
        ...prev,
        [selectedPin.id]: { ...prev[selectedPin.id], ...(type === "before" ? { beforeUploaded: true } : { afterUploaded: true }) },
      }));
      Toast.show({ type: "success", text1: `${type === "before" ? "Before" : "After"} photo uploaded.` });
      if (type === "before") setActiveTab("ANNOTATE");
      else closeModal();
    } catch {
      Toast.show({ type: "error", text1: "Upload failed.", text2: "Check connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  // ─── Save annotation ──────────────────────────────────────────────────────

  const saveAnnotation = async () => {
    if (!selectedPin) return;
    const annotatedAt = new Date().toISOString();
    setSaving(true);
    const token = await SecureStore.getItemAsync("userToken");
    try {
      const res = await fetch(`${SERVER_BASE}/api/mideast/fo-annotations/job/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          point_id:     selectedPin.id,
          note:         note.trim() || "No observation noted.",
          flag:         flagged,
          annotated_at: annotatedAt,
        }),
      });
      if (!res.ok) throw new Error();
      setPinStatuses((prev) => ({ ...prev, [selectedPin.id]: { ...prev[selectedPin.id], annotationSaved: true } }));
      Toast.show({ type: "success", text1: "Annotation saved." });
      setActiveTab("AFTER");
    } catch {
      Toast.show({ type: "error", text1: "Save failed.", text2: "Check connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  // ─── Stepper ──────────────────────────────────────────────────────────────

  const renderStepper = () => (
    <View style={styles.stepper}>
      {STEP_DEFS.map((step, index) => {
        const done    = jobStep >= index;
        const current = jobStep === index - 1;
        return (
          <React.Fragment key={step.key}>
            {index > 0 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, done && styles.stepCircleDone, current && styles.stepCircleCurrent]}>
                {done
                  ? <Ionicons name="checkmark" size={13} color="#080C18" />
                  : <Ionicons name={step.icon as any} size={13} color={current ? "#080C18" : "#475569"} />}
              </View>
              <Text style={[styles.stepLabel, done && styles.stepLabelDone, current && styles.stepLabelCurrent]}>
                {step.label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );

  // ─── CTA Card ─────────────────────────────────────────────────────────────

  const renderCTACard = () => {
    if (stepLoading) return null;
    const nextStep = jobStep + 1;

    if (nextStep === 0) return (
      <View style={styles.ctaCard}>
        <View style={styles.ctaCardLeft}>
          <View style={[styles.ctaIcon, { backgroundColor: "rgba(14,165,233,0.15)" }]}>
            <Ionicons name="location" size={22} color="#0EA5E9" />
          </View>
          <View>
            <Text style={styles.ctaTitle}>Arrived at site?</Text>
            <Text style={styles.ctaSubtitle}>Tap to log your arrival</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.ctaBtn, firingEvent && styles.ctaBtnDisabled]} onPress={() => handleManualEvent("reached_site")} disabled={firingEvent}>
          {firingEvent ? <ActivityIndicator size="small" color="#080C18" /> : <Text style={styles.ctaBtnText}>REACHED SITE</Text>}
        </TouchableOpacity>
      </View>
    );

    if (nextStep === 1) return (
      <View style={styles.ctaCard}>
        <View style={styles.ctaCardLeft}>
          <View style={[styles.ctaIcon, { backgroundColor: "rgba(14,165,233,0.15)" }]}>
            <Ionicons name="grid" size={22} color="#0EA5E9" />
          </View>
          <View>
            <Text style={styles.ctaTitle}>At the panels?</Text>
            <Text style={styles.ctaSubtitle}>Tap to proceed</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.ctaBtn, firingEvent && styles.ctaBtnDisabled]} onPress={() => handleManualEvent("reached_panels")} disabled={firingEvent}>
          {firingEvent ? <ActivityIndicator size="small" color="#080C18" /> : <Text style={styles.ctaBtnText}>REACHED PANELS</Text>}
        </TouchableOpacity>
      </View>
    );

    if (nextStep === 2) {
      // TPT photo required before pins unlock
      if (!tptUploaded) return (
        <View style={[styles.ctaCard, { borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.05)" }]}>
          <View style={styles.ctaCardLeft}>
            <View style={[styles.ctaIcon, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
              <Ionicons name="camera" size={22} color="#F59E0B" />
            </View>
            <View>
              <Text style={styles.ctaTitle}>Toolbox Talk Photo</Text>
              <Text style={styles.ctaSubtitle}>Required before starting work</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: "#F59E0B" }]}
            onPress={() => setShowTptCamera(true)}
          >
            <Text style={styles.ctaBtnText}>TAKE PHOTO</Text>
          </TouchableOpacity>
        </View>
      );
      // TPT done — unlock pins
      return (
        <View style={[styles.ctaCard, styles.ctaCardInfo]}>
          <Ionicons name="camera-outline" size={20} color="#22D3A5" />
          <Text style={styles.ctaInfoText}>Take a BEFORE photo on each pin to begin work</Text>
        </View>
      );
    }

    if (nextStep === 3) return (
      <View style={[styles.ctaCard, styles.ctaCardInfo]}>
        <Ionicons name="sync-outline" size={20} color="#F59E0B" />
        <Text style={styles.ctaInfoText}>{doneCount}/{points.length} pins done — complete all AFTER photos to finish</Text>
      </View>
    );

    if (nextStep === 4) return (
      <View style={[styles.ctaCard, { borderColor: "rgba(34,211,165,0.4)", backgroundColor: "rgba(34,211,165,0.05)" }]}>
        <View style={styles.ctaCardLeft}>
          <View style={[styles.ctaIcon, { backgroundColor: "rgba(34,211,165,0.15)" }]}>
            <Ionicons name="exit" size={22} color="#22D3A5" />
          </View>
          <View>
            <Text style={styles.ctaTitle}>All done!</Text>
            <Text style={styles.ctaSubtitle}>Fill in your service report</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: "#22D3A5" }, firingEvent && styles.ctaBtnDisabled]}
          onPress={() => handleManualEvent("site_exited")}
          disabled={firingEvent}
        >
          <Text style={styles.ctaBtnText}>SUBMIT FSR</Text>
        </TouchableOpacity>
      </View>
    );

    return null;
  };

  // ─── Photo tab ────────────────────────────────────────────────────────────

  const renderPhotoTab = (type: "before" | "after") => {
    if (!selectedPin) return null;
    const status   = pinStatuses[selectedPin.id];
    const uri      = type === "before" ? status?.beforeUri      : status?.afterUri;
    const uploaded = type === "before" ? status?.beforeUploaded : status?.afterUploaded;
    const locked   = type === "after" && !status?.annotationSaved;

    if (locked) return (
      <View style={styles.tabContent}>
        <Ionicons name="lock-closed" size={48} color="#1E2A45" />
        <Text style={styles.lockedText}>Complete the Annotate step first.</Text>
      </View>
    );

    if (showCamera && cameraTarget === type) return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={styles.cameraControls}>
          <TouchableOpacity onPress={() => setShowCamera(false)} style={styles.camBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={takePicture} style={styles.captureBtn}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={{ width: 52 }} />
        </View>
      </View>
    );

    if (uri) return (
      <View style={styles.tabContent}>
        <Image source={{ uri }} style={styles.photoPreview} resizeMode="cover" />
        {uploaded ? (
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#22D3A5" />
            <Text style={[styles.statusBadgeText, { color: "#22D3A5" }]}>Uploaded</Text>
          </View>
        ) : (
          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={() => launchCamera(type)}>
              <Ionicons name="camera" size={16} color="#94A3B8" />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, saving && styles.btnDisabled]} onPress={() => confirmPhoto(type)} disabled={saving}>
              {saving ? <ActivityIndicator color="#080C18" size="small" /> : (
                <><Ionicons name="checkmark" size={16} color="#080C18" /><Text style={styles.confirmBtnText}>Confirm</Text></>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );

    return (
      <View style={styles.tabContent}>
        <Ionicons name={type === "before" ? "camera-outline" : "checkmark-done-outline"} size={64} color="#1E2A45" />
        <Text style={styles.photoPrompt}>
          {type === "before" ? "Capture panel condition BEFORE cleaning." : "Capture panel condition AFTER cleaning."}
        </Text>
        <TouchableOpacity style={styles.takePhotoBtn} onPress={() => launchCamera(type)}>
          <Ionicons name="camera" size={20} color="#080C18" />
          <Text style={styles.takePhotoBtnText}>Open Camera</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Annotate tab ─────────────────────────────────────────────────────────

  const renderAnnotateTab = () => {
    if (!selectedPin) return null;
    const status = pinStatuses[selectedPin.id];
    if (status?.annotationSaved) return (
      <View style={styles.tabContent}>
        <Ionicons name="checkmark-circle" size={64} color="#22D3A5" />
        <Text style={[styles.photoPrompt, { color: "#22D3A5" }]}>Annotation saved.</Text>
      </View>
    );
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.tabContent}>
        <Text style={styles.fieldLabel}>OBSERVATION NOTE</Text>
        <TextInput
          style={styles.noteInput} placeholder="Describe what you observed..." placeholderTextColor="#475569"
          multiline numberOfLines={4} value={note} onChangeText={setNote}
        />
        <TouchableOpacity style={[styles.flagRow, flagged && styles.flagRowActive]} onPress={() => setFlagged(f => !f)} activeOpacity={0.7}>
          <Ionicons name={flagged ? "flag" : "flag-outline"} size={20} color={flagged ? "#EF4444" : "#475569"} />
          <Text style={[styles.flagText, flagged && { color: "#EF4444" }]}>
            {flagged ? "FLAGGED — Issue Reported" : "Flag for Attention"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.saveAnnotationBtn, saving && styles.btnDisabled]} onPress={saveAnnotation} disabled={saving}>
          {saving ? <ActivityIndicator color="#080C18" /> : (
            <><Ionicons name="save" size={18} color="#080C18" /><Text style={styles.saveAnnotationText}>SAVE ANNOTATION</Text></>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  };

  // ─── No diagram fallback ──────────────────────────────────────────────────

  if (!diagram) return (
    <LinearGradient colors={["#080C18", "#0D1120"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <Ionicons name="map-outline" size={64} color="#1E2A45" />
          <Text style={styles.noDiagramText}>No diagram assigned to this job.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackBtn}>
            <Text style={styles.goBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={["#080C18", "#0D1120"]} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0EA5E9" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{diagram.title ?? "SITE MAP"}</Text>
            <Text style={styles.headerSub}>{doneCount}/{points.length} PINS DONE</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {renderStepper()}
        {renderCTACard()}

        {jobStep >= 1 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: points.length > 0 ? `${(doneCount / points.length) * 100}%` : "0%" }]} />
          </View>
        )}

        <View
          style={styles.diagramContainer}
          onLayout={(e) => setContainerLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          {imageUrl && (
            <>
              <Image
                source={{ uri: imageUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
                onLoad={(e) => {
                  setImageNatural({ width: e.nativeEvent.source.width, height: e.nativeEvent.source.height });
                  setImageLoading(false);
                }}
              />
              {imageLoading && (
                <View style={styles.imageLoader}>
                  <ActivityIndicator size="large" color="#0EA5E9" />
                  <Text style={styles.imageLoaderText}>LOADING DIAGRAM...</Text>
                </View>
              )}
            </>
          )}

          {/* ── Pins ── */}
          {!imageLoading && points.map((point, idx) => {
            const state  = getPinState(point.id);
            const locked = pinsLocked;
            const pinBg  = locked ? "#1E2A45"
              : state === "done"   ? "#22D3A5"
              : state === "before" ? "#F59E0B"
              : "#0EA5E9";
            const shadowC = locked ? "#000"
              : state === "done"   ? "#22D3A5"
              : state === "before" ? "#F59E0B"
              : "#0EA5E9";
            return (
              <TouchableOpacity
                key={point.id}
                style={[styles.pinWrapper, getPinStyle(point)]}
                onPress={() => openPin(point)}
                activeOpacity={locked ? 1 : 0.8}
              >
                <View style={[
                  styles.pinDot,
                  { backgroundColor: pinBg, borderColor: locked ? "#2D3A50" : "#fff",
                    shadowColor: shadowC, elevation: locked ? 0 : 6 }
                ]}>
                  {state === "done" && !locked
                    ? <Ionicons name="checkmark" size={16} color="#080C18" />
                    : state === "before" && !locked
                      ? <Ionicons name="time-outline" size={14} color="#080C18" />
                      : <Text style={[styles.pinIndex, { color: locked ? "#2D3A50" : "#080C18" }]}>
                          {idx + 1}
                        </Text>
                  }
                </View>
                {point.label ? (
                  <View style={styles.pinLabelWrap}>
                    <Text style={styles.pinLabelText} numberOfLines={1}>{point.label}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}

          {pinsLocked && !imageLoading && (
            <View style={styles.diagramLockOverlay}>
              <View style={styles.diagramLockCard}>
                <Ionicons name="lock-closed" size={28} color="#475569" />
                <Text style={styles.diagramLockText}>
                  {jobStep < 1
                    ? "Tap REACHED PANELS\nto unlock the diagram"
                    : "Take TPT photo\nto unlock the diagram"}
                </Text>
              </View>
            </View>
          )}
        </View>

        {jobStep >= 1 && !pinsLocked && (
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#0EA5E9" }]} /><Text style={styles.legendText}>Pending</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} /><Text style={styles.legendText}>Before done</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#22D3A5" }]} /><Text style={styles.legendText}>Complete</Text></View>
          </View>
        )}

      </SafeAreaView>

      {/* ── Pin Modal ── */}
      <Modal visible={!!selectedPin} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedPin?.label ? selectedPin.label : `Pin #${selectedPin?.id}`}
                </Text>
                <Text style={styles.modalSub}>{selectedPin ? `${selectedPin.x_percent.toFixed(0)}% · ${selectedPin.y_percent.toFixed(0)}%` : ""}</Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <View style={styles.tabBar}>
              {TABS.map((tab) => {
                const s      = selectedPin ? pinStatuses[selectedPin.id] : null;
                const isDone = tab === "BEFORE" ? s?.beforeUploaded : tab === "ANNOTATE" ? s?.annotationSaved : s?.afterUploaded;
                return (
                  <TouchableOpacity key={tab} style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]} onPress={() => setActiveTab(tab)}>
                    {isDone && <Ionicons name="checkmark-circle" size={12} color="#22D3A5" style={{ marginRight: 4 }} />}
                    <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>{tab}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalBody}>
              {activeTab === "BEFORE"   && renderPhotoTab("before")}
              {activeTab === "ANNOTATE" && renderAnnotateTab()}
              {activeTab === "AFTER"    && renderPhotoTab("after")}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── TPT Camera Modal ── */}
      <Modal visible={showTptCamera} animationType="slide" transparent={false} onRequestClose={() => { setShowTptCamera(false); setTptUri(null); }}>
        <View style={styles.tptModal}>
          <View style={styles.tptModalHeader}>
            <Text style={styles.tptModalTitle}>TOOLBOX TALK PHOTO</Text>
            <TouchableOpacity onPress={() => { setShowTptCamera(false); setTptUri(null); }}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <Text style={styles.tptModalSub}>
            Photograph your team's toolbox talk before work begins.
          </Text>

          {tptUri ? (
            <View style={styles.tptPreviewWrap}>
              <Image source={{ uri: tptUri }} style={styles.tptPreviewImg} resizeMode="cover" />
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.retakeBtn} onPress={() => setTptUri(null)}>
                  <Ionicons name="camera" size={16} color="#94A3B8" />
                  <Text style={styles.retakeBtnText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, tptUploading && styles.btnDisabled]}
                  onPress={uploadTptPhoto}
                  disabled={tptUploading}
                >
                  {tptUploading
                    ? <ActivityIndicator color="#080C18" size="small" />
                    : <><Ionicons name="checkmark" size={16} color="#080C18" /><Text style={styles.confirmBtnText}>Confirm</Text></>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.tptCameraWrap}>
              <CameraView ref={tptCameraRef} style={StyleSheet.absoluteFill} facing="back" />
              <View style={styles.cameraControls}>
                <View style={{ width: 52 }} />
                <TouchableOpacity onPress={takeTptPicture} style={styles.captureBtn}>
                  <View style={styles.captureInner} />
                </TouchableOpacity>
                <View style={{ width: 52 }} />
              </View>
            </View>
          )}
        </View>
      </Modal>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  safeArea:   { flex: 1 },
  centered:   { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  noDiagramText: { color: "#475569", fontSize: 16, marginTop: 16, textAlign: "center" },
  goBackBtn:  { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: "#1E2A45", borderRadius: 12 },
  goBackBtnText: { color: "#0EA5E9", fontWeight: "bold" },

  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1E2A45" },
  backBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(14,165,233,0.1)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(14,165,233,0.3)" },
  headerCenter: { alignItems: "center" },
  headerTitle:  { fontSize: 16, fontWeight: "900", color: "#F1F5F9", letterSpacing: 1 },
  headerSub:    { fontSize: 11, color: "#94A3B8", letterSpacing: 1, marginTop: 2 },

  stepper:          { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", paddingVertical: 14, paddingHorizontal: 12, backgroundColor: "#0A0F1E", borderBottomWidth: 1, borderBottomColor: "#1E2A45" },
  stepItem:         { alignItems: "center", width: 52 },
  stepLine:         { flex: 1, height: 2, backgroundColor: "#1E2A45", marginTop: 14, maxWidth: 20 },
  stepLineDone:     { backgroundColor: "#22D3A5" },
  stepCircle:       { width: 30, height: 30, borderRadius: 15, backgroundColor: "#1E2A45", justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#2D3A50" },
  stepCircleDone:   { backgroundColor: "#22D3A5", borderColor: "#22D3A5" },
  stepCircleCurrent:{ backgroundColor: "#0EA5E9", borderColor: "#0EA5E9", shadowColor: "#0EA5E9", shadowOpacity: 0.6, shadowRadius: 8, elevation: 4 },
  stepLabel:        { fontSize: 9, color: "#475569", textAlign: "center", marginTop: 5, letterSpacing: 0.3, lineHeight: 13 },
  stepLabelDone:    { color: "#22D3A5" },
  stepLabelCurrent: { color: "#0EA5E9", fontWeight: "bold" },

  ctaCard:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", margin: 12, padding: 14, backgroundColor: "#0A0F1E", borderRadius: 14, borderWidth: 1, borderColor: "#1E2A45" },
  ctaCardInfo:  { justifyContent: "flex-start", gap: 10 },
  ctaCardLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  ctaIcon:      { width: 42, height: 42, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  ctaTitle:     { fontSize: 14, fontWeight: "bold", color: "#F1F5F9" },
  ctaSubtitle:  { fontSize: 11, color: "#475569", marginTop: 2 },
  ctaBtn:       { backgroundColor: "#0EA5E9", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minWidth: 80, alignItems: "center" },
  ctaBtnDisabled:{ opacity: 0.5 },
  ctaBtnText:   { color: "#080C18", fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
  ctaInfoText:  { fontSize: 13, color: "#94A3B8", flex: 1, lineHeight: 18 },

  progressTrack: { height: 3, backgroundColor: "#1E2A45" },
  progressFill:  { height: 3, backgroundColor: "#22D3A5" },

  diagramContainer:  { flex: 1, position: "relative", backgroundColor: "#080C18" },
  imageLoader:       { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "#080C18" },
  imageLoaderText:   { color: "#0EA5E9", fontSize: 12, fontWeight: "bold", letterSpacing: 2, marginTop: 12 },
  diagramLockOverlay:{ ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(8,12,24,0.75)" },
  diagramLockCard:   { alignItems: "center", padding: 24, backgroundColor: "#0D1120", borderRadius: 16, borderWidth: 1, borderColor: "#1E2A45" },
  diagramLockText:   { color: "#475569", fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 20 },

  // ── Pin styles ──────────────────────────────────────────────────────────
  pinWrapper: {
    position: "absolute",
    alignItems: "center",
  },
  pinDot: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  pinIndex: {
    fontSize: 13,
    fontWeight: "800",
  },
  pinLabelWrap: {
    marginTop: 3,
    backgroundColor: "rgba(8,12,24,0.82)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    maxWidth: 70,
  },
  pinLabelText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#E2E8F0",
    letterSpacing: 0.3,
    textAlign: "center",
  },

  legend:      { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#1E2A45", backgroundColor: "#0D1120" },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendText:  { fontSize: 11, color: "#94A3B8" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet:   { backgroundColor: "#0D1120", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: "#1E2A45", maxHeight: "82%" },
  modalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#1E2A45" },
  modalTitle:   { fontSize: 16, fontWeight: "900", color: "#F1F5F9", letterSpacing: 1 },
  modalSub:     { fontSize: 11, color: "#475569", marginTop: 4 },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1E2A45", justifyContent: "center", alignItems: "center" },
  tabBar:       { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1E2A45" },
  tabBtn:       { flex: 1, paddingVertical: 12, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: "#0EA5E9" },
  tabBtnText:   { fontSize: 12, fontWeight: "bold", color: "#475569", letterSpacing: 1 },
  tabBtnTextActive: { color: "#0EA5E9" },
  modalBody:    { minHeight: 280 },

  tabContent:   { padding: 24, alignItems: "center", justifyContent: "center", minHeight: 280 },
  lockedText:   { color: "#475569", fontSize: 14, marginTop: 12, textAlign: "center" },
  photoPreview: { width: "100%", height: 200, borderRadius: 12 },
  statusBadge:  { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 12 },
  statusBadgeText: { fontWeight: "bold", fontSize: 14 },
  photoActions: { flexDirection: "row", gap: 12, marginTop: 16, width: "100%" },
  retakeBtn:    { flex: 1, flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", paddingVertical: 12, backgroundColor: "#1E2A45", borderRadius: 12 },
  retakeBtnText:{ color: "#94A3B8", fontWeight: "bold", fontSize: 14 },
  confirmBtn:   { flex: 2, flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", paddingVertical: 12, backgroundColor: "#22D3A5", borderRadius: 12 },
  confirmBtnText:{ color: "#080C18", fontWeight: "900", fontSize: 14 },
  photoPrompt:  { color: "#475569", fontSize: 14, textAlign: "center", marginTop: 12, marginBottom: 24 },
  takePhotoBtn: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#0EA5E9", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  takePhotoBtnText: { color: "#080C18", fontWeight: "900", fontSize: 15 },
  btnDisabled:  { opacity: 0.5 },

  cameraContainer: { width: "100%", height: 320, borderRadius: 16, overflow: "hidden", position: "relative" },
  cameraControls:  { position: "absolute", bottom: 20, left: 0, right: 0, flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  camBtn:          { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  captureBtn:      { width: 72, height: 72, borderRadius: 36, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", borderWidth: 4, borderColor: "rgba(255,255,255,0.5)" },
  captureInner:    { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },

  fieldLabel:       { alignSelf: "flex-start", fontSize: 11, fontWeight: "bold", color: "#475569", letterSpacing: 1, marginBottom: 8 },
  noteInput:        { width: "100%", backgroundColor: "#080C18", color: "#F1F5F9", borderWidth: 1, borderColor: "#1E2A45", borderRadius: 12, padding: 14, fontSize: 14, textAlignVertical: "top", minHeight: 100 },
  flagRow:          { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, width: "100%", padding: 14, backgroundColor: "#1E2A45", borderRadius: 12, borderWidth: 1, borderColor: "#1E2A45" },
  flagRowActive:    { borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)" },
  flagText:         { color: "#475569", fontWeight: "bold", fontSize: 14 },
  saveAnnotationBtn:{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", marginTop: 16, width: "100%", paddingVertical: 14, backgroundColor: "#F59E0B", borderRadius: 12 },
  saveAnnotationText:{ color: "#080C18", fontWeight: "900", fontSize: 15, letterSpacing: 1 },

  // TPT Modal
  tptModal:       { flex: 1, backgroundColor: "#080C18", paddingTop: Platform.OS === "ios" ? 52 : 24 },
  tptModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  tptModalTitle:  { fontSize: 13, fontWeight: "700", color: "#F59E0B", letterSpacing: 2 },
  tptModalSub:    { fontSize: 12, color: "#475569", paddingHorizontal: 16, marginBottom: 16, lineHeight: 18 },
  tptCameraWrap:  { flex: 1, position: "relative", margin: 16, borderRadius: 16, overflow: "hidden" },
  tptPreviewWrap: { flex: 1, margin: 16 },
  tptPreviewImg:  { flex: 1, borderRadius: 16, width: "100%" },
});