import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

// Import your global API clients
import apiClient, { faceInstance } from "../api/client";

const { width } = Dimensions.get("window");
const SCAN_BOX_SIZE = width * 0.82;

// ── Timezone helpers ─────────────────────────────────────────────────────────
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

const formatPKT = (iso: string | null | undefined): string => {
  if (!iso) return "--:--";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "--:--";
  }
};

const getPKTDateString = (): string =>
  new Date(Date.now() + PKT_OFFSET_MS).toISOString().split("T")[0];

const formatElapsed = (s: number): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

const computeDuration = (inIso: string, outIso: string): string => {
  const m = Math.round(
    (new Date(outIso).getTime() - new Date(inIso).getTime()) / 60000,
  );
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

// ── Types ────────────────────────────────────────────────────────────────────
type ScreenState = "loading" | "not_clocked_in" | "clocked_in" | "clocked_out" | "scanning" | "processing";
type AttendanceAction = "clock_in" | "clock_out";

// ── Component ────────────────────────────────────────────────────────────────
export default function MarkAttendanceScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();

  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [pendingAction, setPendingAction] = useState<AttendanceAction>("clock_in");

  const [foName, setFoName] = useState("");
  const [clockInAt, setClockInAt] = useState<string | null>(null);
  const [clockOutAt, setClockOutAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const faceCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCaptureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const captureInProgress = useRef(false);
  const isPolling = useRef(false);
  const scanningActive = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  // ── Mount ──────────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      fetchTodayStatus();
    }, []),
  );

  const fetchTodayStatus = async () => {
    setScreenState("loading");
    try {
      const res = await apiClient.get("/attendance/status");
      const d = res.data;
      if (d.status === "clocked_in") {
        setFoName(d.fo_name || "");
        setClockInAt(d.clock_in_at || null);
        setScreenState("clocked_in");
      } else if (d.status === "clocked_out") {
        setFoName(d.fo_name || "");
        setClockInAt(d.clock_in_at || null);
        setClockOutAt(d.clock_out_at || null);
        setScreenState("clocked_out");
      } else {
        setScreenState("not_clocked_in");
      }
    } catch (err: any) {
      setScreenState("not_clocked_in");
    }
  };

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (screenState !== "clocked_in" || !clockInAt) return;
    const tick = () =>
      setElapsedSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - new Date(clockInAt).getTime()) / 1000),
        ),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [screenState, clockInAt]);

  // ── Success animation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (screenState === "clocked_in" || screenState === "clocked_out") {
      successAnim.setValue(0);
      Animated.spring(successAnim, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [screenState]);

  // ── Start camera animations + polling when scanning ────────────────────────
  useEffect(() => {
    if (screenState === "scanning") {
      startAnimations();
      startFaceDetectionPolling();
      return () => stopScan();
    }
  }, [screenState]);

  const startAnimations = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();
  };

  const startFaceDetectionPolling = () => {
    scanningActive.current = true;
    faceCheckInterval.current = setInterval(async () => {
      if (!scanningActive.current || captureInProgress.current || isPolling.current || !cameraRef.current) return;
      isPolling.current = true;

      try {
        const snapshot = await cameraRef.current.takePictureAsync({
          quality: 0.3, // BUMPED from 0.1 to make the face clearer
          base64: true,
          skipProcessing: false, // CHANGED to false so Expo fixes the 90-degree rotation bug
        });

        if (!snapshot?.base64 || !scanningActive.current) return;

        // Try adding the standard image prefix just in case Python requires it
        const formattedBase64 = `data:image/jpeg;base64,${snapshot.base64}`;

        const response = await faceInstance.post("/detect-face", { 
          // Try sending raw first. If it still fails, change this to: image: formattedBase64
          image: snapshot.base64 
        });

        // TEMPORARY LOG: Let's see exactly what Python is saying!
        console.log("Python API says:", response.data);

        if (!scanningActive.current) return;

        if (response.data.face_found) {
          setFaceDetected(true);
          if (!autoCaptureTimer.current) {
            autoCaptureTimer.current = setTimeout(() => {
              if (scanningActive.current && !captureInProgress.current) {
                recordAttendance();
              }
            }, 800);
          }
        } else {
          setFaceDetected(false);
          if (autoCaptureTimer.current) {
            clearTimeout(autoCaptureTimer.current);
            autoCaptureTimer.current = null;
          }
        }
      } catch (error: any) {
        console.error("FACE SCAN ERROR:", error?.message || "Unknown Error");
      } finally {
        isPolling.current = false;
      }
    }, 800);
  };

  const stopScan = () => {
    scanningActive.current = false;
    if (faceCheckInterval.current) clearInterval(faceCheckInterval.current);
    if (autoCaptureTimer.current) clearTimeout(autoCaptureTimer.current);
    faceCheckInterval.current = null;
    autoCaptureTimer.current = null;
    pulseAnim.setValue(1);
    scanLineAnim.setValue(0);
    isPolling.current = false;
  };

  const cancelScan = () => {
    stopScan();
    captureInProgress.current = false;
    setFaceDetected(false);
    setScreenState(pendingAction === "clock_in" ? "not_clocked_in" : "clocked_in");
  };

  const recordAttendance = async () => {
    if (captureInProgress.current || !cameraRef.current) return;
    captureInProgress.current = true;
    stopScan();
    setFaceDetected(false);
    setScreenState("processing");

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        Alert.alert("Error", "Could not capture photo. Please try again.");
        captureInProgress.current = false;
        cancelScan();
        return;
      }

      const response = await apiClient.post("/attendance/mark", {
        image: photo.base64,
        action: pendingAction,
      });

      const data = response.data;

      if (data.success) {
        setFoName(data.name || "");
        if (data.action === "clock_in") {
          setClockInAt(data.clock_in_at);
          setClockOutAt(null);
          setScreenState("clocked_in");
        } else {
          setClockInAt(data.clock_in_at);
          setClockOutAt(data.clock_out_at);
          setScreenState("clocked_out");
        }
      } else {
        Alert.alert("Not Recognized", data.message || "Face not found. Please try again.");
        captureInProgress.current = false;
        cancelScan();
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        const d = error.response.data;
        if (d.clock_in_at) setClockInAt(d.clock_in_at);
        if (d.clock_out_at) setClockOutAt(d.clock_out_at);
        setScreenState(pendingAction === "clock_in" ? "clocked_in" : "clocked_out");
        return;
      }

      const msg = error.code === "ECONNABORTED" ? "Request timed out." : error.response?.data?.message || "Unable to connect to server.";
      Alert.alert("Error", msg);
      captureInProgress.current = false;
      cancelScan();
    }
  };

  const startScan = (action: AttendanceAction) => {
    captureInProgress.current = false;
    setPendingAction(action);
    setFaceDetected(false);
    setScreenState("scanning");
  };

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_BOX_SIZE - 4],
  });

  // ── Render Helpers ─────────────────────────────────────────────────────────
  const renderHeader = () => (
    <View style={S.header}>
      <TouchableOpacity onPress={() => navigation.openDrawer()} style={S.menuButton}>
        <Ionicons name="menu" size={28} color="#F59E0B" />
      </TouchableOpacity>
      <View style={S.headerTextContainer}>
        <Text style={S.headerTitle}>ATTENDANCE</Text>
        <Text style={S.headerSubtitle}>TIME TRACKING</Text>
      </View>
      <View style={{ width: 44 }} />
    </View>
  );

  // ── Permission ─────────────────────────────────────────────────────────────
  if (!permission) return <View style={S.container} />;

  if (!permission.granted) {
    return (
      <LinearGradient colors={['#050B14', '#0B192C', '#050B14']} style={S.container}>
        <SafeAreaView style={S.center}>
          {renderHeader()}
          <View style={S.center}>
            <Ionicons name="camera-outline" size={64} color="#94A3B8" style={{ marginBottom: 20 }} />
            <Text style={S.permissionText}>Camera access is required for biometric attendance.</Text>
            <TouchableOpacity style={S.primaryBtn} onPress={requestPermission}>
              <Text style={S.primaryBtnText}>GRANT PERMISSION</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Scanning / Processing ──────────────────────────────────────────────────
  if (screenState === "scanning" || screenState === "processing") {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" flash="off" mute={true} />
        <View style={S.overlay}>
          <View style={[S.overlayBlock, { flex: 1, justifyContent: "flex-end", paddingBottom: 24 }]}>
            <Text style={S.scanTitle}>
              {screenState === "processing" ? "VERIFYING IDENTITY..." : pendingAction === "clock_in" ? "CLOCK IN" : "CLOCK OUT"}
            </Text>
            <Text style={S.scanSubtitle}>
              {screenState === "processing" ? "Please hold still" : "Position your face in the frame"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", height: SCAN_BOX_SIZE }}>
            <View style={[S.overlayBlock, { flex: 1 }]} />
            <Animated.View style={[S.scanBox, { transform: [{ scale: pulseAnim }] }]}>
              {(["cornerTL", "cornerTR", "cornerBL", "cornerBR"] as const).map((c) => (
                <View key={c} style={[S.corner, S[c], faceDetected && S.cornerGreen]} />
              ))}
              {screenState === "scanning" && (
                <Animated.View style={[S.scanLine, { transform: [{ translateY: scanLineTranslate }] }, faceDetected && S.scanLineGreen]} />
              )}
              {screenState === "processing" && (
                <View style={S.processingOverlay}>
                  <ActivityIndicator size="large" color="#4ADE80" />
                </View>
              )}
            </Animated.View>
            <View style={[S.overlayBlock, { flex: 1 }]} />
          </View>

          <View style={[S.overlayBlock, { flex: 1, paddingTop: 28, alignItems: "center" }]}>
            <View style={S.statusRow}>
              <View style={[S.statusDot, faceDetected && S.statusDotGreen]} />
              <Text style={[S.statusText, faceDetected && S.statusTextGreen]}>
                {screenState === "processing" ? "Processing..." : faceDetected ? "Face detected — hold still..." : "Scanning for face..."}
              </Text>
            </View>
            {screenState === "scanning" && (
              <TouchableOpacity onPress={cancelScan} style={S.cancelBtn}>
                <Text style={S.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  // ── Main UI (Loading, Idle, Clocked In, Clocked Out) ───────────────────────
  return (
    <LinearGradient colors={['#050B14', '#0B192C', '#050B14']} style={S.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {renderHeader()}
        
        {screenState === "loading" ? (
          <View style={S.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={S.loadingText}>CHECKING SYSTEM STATUS...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
            
            {/* NOT CLOCKED IN */}
            {screenState === "not_clocked_in" && (
              <View style={S.idleContent}>
                <View style={S.bigIconCircle}>
                  <Ionicons name="person-circle-outline" size={60} color="#3B82F6" />
                </View>
                <Text style={S.title}>BIOMETRIC LOCK</Text>
                <Text style={S.subtitle}>Scan your face to initiate shift for{"\n"}{getPKTDateString()}</Text>
                
                <TouchableOpacity style={S.clockInBtn} onPress={() => startScan("clock_in")}>
                  <Ionicons name="scan-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={S.clockInBtnText}>CLOCK IN</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* CLOCKED IN */}
            {screenState === "clocked_in" && (
              <Animated.View style={{ transform: [{ scale: successAnim }], opacity: successAnim }}>
                <BlurView intensity={20} tint="dark" style={S.glassCard}>
                  <View style={S.onlinePulseRow}>
                    <View style={S.pulseDot} />
                    <Text style={S.onlineLabel}>ON DUTY</Text>
                  </View>
                  <View style={[S.bigIconCircle, { borderColor: "rgba(16, 185, 129, 0.4)" }]}>
                    <Ionicons name="checkmark-circle" size={50} color="#10B981" />
                  </View>
                  <Text style={S.clockedInName}>{foName}</Text>
                  <Text style={S.elapsedTimer}>{formatElapsed(elapsedSeconds)}</Text>
                  <Text style={S.elapsedLabel}>ACTIVE SHIFT DURATION</Text>
                  
                  <View style={S.clockInBadge}>
                    <Text style={S.clockInBadgeLabel}>CLOCK IN TIME</Text>
                    <Text style={S.clockInBadgeTime}>{formatPKT(clockInAt)}</Text>
                  </View>
                </BlurView>

                <TouchableOpacity style={S.clockOutBtn} onPress={() => startScan("clock_out")}>
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={S.clockOutBtnText}>CLOCK OUT</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* CLOCKED OUT */}
            {screenState === "clocked_out" && (
              <Animated.View style={{ transform: [{ scale: successAnim }], opacity: successAnim }}>
                <BlurView intensity={20} tint="dark" style={S.glassCard}>
                  <View style={[S.bigIconCircle, { borderColor: "rgba(245, 158, 11, 0.4)" }]}>
                    <Ionicons name="flag" size={40} color="#F59E0B" />
                  </View>
                  <Text style={S.doneTitle}>SHIFT COMPLETE</Text>
                  <Text style={S.doneName}>{foName}</Text>
                  <Text style={S.doneDate}>{getPKTDateString()}</Text>
                </BlurView>

                <BlurView intensity={20} tint="dark" style={[S.glassCard, { marginTop: 16 }]}>
                  <Text style={S.sectionLabel}>TIMELINE</Text>
                  <View style={S.timelineRow}>
                    <View style={[S.timelineDot, { backgroundColor: "#10B981" }]} />
                    <View style={S.timelineLine} />
                    <View style={[S.timelineDot, { backgroundColor: "#EF4444" }]} />
                  </View>
                  
                  <View style={S.timelineLabels}>
                    <View style={S.timelineItem}>
                      <Text style={S.timelineLabel}>CLOCK IN</Text>
                      <Text style={S.timelineTime}>{formatPKT(clockInAt)}</Text>
                    </View>
                    <View style={[S.timelineItem, { alignItems: "center" }]}>
                      <Text style={S.durationBadge}>{clockInAt && clockOutAt ? computeDuration(clockInAt, clockOutAt) : "--"}</Text>
                      <Text style={[S.timelineLabel, { marginTop: 4 }]}>TOTAL</Text>
                    </View>
                    <View style={[S.timelineItem, { alignItems: "flex-end" }]}>
                      <Text style={S.timelineLabel}>CLOCK OUT</Text>
                      <Text style={[S.timelineTime, { color: "#EF4444" }]}>{formatPKT(clockOutAt)}</Text>
                    </View>
                  </View>
                </BlurView>
              </Animated.View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const C_DEFAULT = "rgba(255,255,255,0.55)";
const C_GREEN = "#10B981"; 
const C_SIZE = 22;
const C_THICK = 3;

const S = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { flexGrow: 1, paddingBottom: 40, paddingTop: 20 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 20 : 0, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(59, 130, 246, 0.2)' },
  menuButton: { padding: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  headerTextContainer: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: 2 },
  headerSubtitle: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 4, letterSpacing: 1 },
  
  loadingText: { color: '#3B82F6', marginTop: 16, letterSpacing: 2, fontWeight: 'bold' },

  // Idle
  idleContent: { alignItems: "center", paddingHorizontal: 32, marginTop: 40 },
  bigIconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(59, 130, 246, 0.1)", borderWidth: 1, borderColor: "rgba(59, 130, 246, 0.3)", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "900", color: "#FFFFFF", marginBottom: 8, letterSpacing: 2, textAlign: "center" },
  subtitle: { fontSize: 14, color: "#94A3B8", textAlign: "center", lineHeight: 22, marginBottom: 40 },
  
  clockInBtn: { flexDirection: 'row', width: '100%', borderRadius: 12, backgroundColor: "rgba(16, 185, 129, 0.2)", paddingVertical: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(16, 185, 129, 0.5)" },
  clockInBtnText: { fontSize: 16, fontWeight: "800", color: "#10B981", letterSpacing: 1 },

  glassCard: { marginHorizontal: 20, borderRadius: 20, padding: 24, alignItems: "center", borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' },

  // Clocked In
  onlinePulseRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C_GREEN, shadowColor: C_GREEN, shadowOpacity: 0.8, shadowRadius: 6 },
  onlineLabel: { fontSize: 12, fontWeight: "800", color: C_GREEN, letterSpacing: 2 },
  clockedInName: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", marginTop: 16, marginBottom: 8 },
  elapsedTimer: { fontSize: 48, fontWeight: "300", color: C_GREEN, fontVariant: ["tabular-nums"], letterSpacing: -1, marginTop: 4 },
  elapsedLabel: { fontSize: 10, color: "#94A3B8", fontWeight: "700", letterSpacing: 1, marginBottom: 20 },
  
  clockInBadge: { backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  clockInBadgeLabel: { fontSize: 10, color: "#64748B", fontWeight: "700", letterSpacing: 1 },
  clockInBadgeTime: { fontSize: 18, fontWeight: "700", color: "#E2E8F0", marginTop: 2 },
  
  clockOutBtn: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, borderRadius: 12, backgroundColor: "rgba(239, 68, 68, 0.1)", paddingVertical: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)" },
  clockOutBtnText: { fontSize: 16, fontWeight: "800", color: "#EF4444", letterSpacing: 1 },

  // Clocked Out
  doneTitle: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", marginTop: 16, marginBottom: 4, letterSpacing: 1 },
  doneName: { fontSize: 16, fontWeight: "600", color: "#94A3B8", marginBottom: 4 },
  doneDate: { fontSize: 12, color: "#64748B" },
  
  sectionLabel: { fontSize: 10, fontWeight: "800", color: "#64748B", letterSpacing: 1.5, marginBottom: 20 },
  timelineRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  timelineDot: { width: 14, height: 14, borderRadius: 7 },
  timelineLine: { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.1)", marginHorizontal: 8 },
  timelineLabels: { flexDirection: "row", justifyContent: "space-between", width: '100%' },
  timelineItem: { flex: 1 },
  timelineLabel: { fontSize: 9, fontWeight: "800", color: "#64748B", letterSpacing: 1.2, marginBottom: 4 },
  timelineTime: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  durationBadge: { fontSize: 16, fontWeight: "800", color: "#3B82F6", backgroundColor: "rgba(59, 130, 246, 0.1)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },

  // Camera Overlay
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: "column" },
  overlayBlock: { backgroundColor: "rgba(5, 11, 20, 0.85)", alignItems: "center", justifyContent: "flex-start" },
  scanTitle: { fontSize: 22, fontWeight: "900", color: "#FFFFFF", letterSpacing: 2 },
  scanSubtitle: { fontSize: 12, color: "#94A3B8", marginTop: 6, letterSpacing: 1 },
  scanBox: { width: SCAN_BOX_SIZE, height: SCAN_BOX_SIZE, position: "relative", overflow: "hidden" },
  corner: { position: "absolute", width: C_SIZE, height: C_SIZE },
  cornerTL: { top: 0, left: 0, borderTopWidth: C_THICK, borderLeftWidth: C_THICK, borderColor: C_DEFAULT, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: C_THICK, borderRightWidth: C_THICK, borderColor: C_DEFAULT, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: C_THICK, borderLeftWidth: C_THICK, borderColor: C_DEFAULT, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: C_THICK, borderRightWidth: C_THICK, borderColor: C_DEFAULT, borderBottomRightRadius: 8 },
  cornerGreen: { borderColor: C_GREEN },
  scanLine: { position: "absolute", left: 4, right: 4, height: 2, backgroundColor: "rgba(59, 130, 246, 0.7)", borderRadius: 1 },
  scanLineGreen: { backgroundColor: "rgba(16, 185, 129, 0.8)" },
  processingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5, 11, 20, 0.7)", alignItems: "center", justifyContent: "center" },
  
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#334155" },
  statusDotGreen: { backgroundColor: C_GREEN },
  statusText: { color: "#94A3B8", fontSize: 12, fontWeight: "600", letterSpacing: 1 },
  statusTextGreen: { color: C_GREEN },
  
  cancelBtn: { marginTop: "auto", marginBottom: 48, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  cancelBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 1 },

  // Misc
  permissionText: { color: "#94A3B8", fontSize: 14, marginBottom: 24, textAlign: "center", paddingHorizontal: 32, lineHeight: 22 },
  primaryBtn: { backgroundColor: "rgba(59, 130, 246, 0.2)", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#3B82F6" },
  primaryBtnText: { color: "#3B82F6", fontWeight: "800", fontSize: 14, letterSpacing: 1 },
});