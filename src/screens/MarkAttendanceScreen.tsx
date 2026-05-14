import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage"; // 🚀 NEW: For the local ledger
import { BlurView } from "expo-blur";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { coreApiClient, faceInstance } from "../api/client";
import { useAuthStore } from "../store/authStore";

const { width } = Dimensions.get("window");
const SCAN_BOX_SIZE = width * 0.92;

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

type ScreenState = "loading" | "idle" | "scanning" | "processing" | "results";
type AttendanceAction = "clock_in" | "clock_out";

interface FaceLocation {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
interface GroupResult {
  name: string;
  status: "success" | "warning" | "error";
  message: string;
  time?: string;
  action?: string;
}

export default function MarkAttendanceScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const userName = useAuthStore((state) => state.userName);

  const [screenState, setScreenState] = useState<ScreenState>("idle");
  const [pendingAction, setPendingAction] =
    useState<AttendanceAction>("clock_in");
  const [resultsList, setResultsList] = useState<GroupResult[]>([]);

  const [faceDetected, setFaceDetected] = useState(false);
  const [facing, setFacing] = useState<CameraType>("front");
  const [faceBoxes, setFaceBoxes] = useState<FaceLocation[]>([]);
  const [frameSize, setFrameSize] = useState({ width: 1, height: 1 });

  const cameraRef = useRef<CameraView>(null);
  const faceCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCaptureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const captureInProgress = useRef(false);
  const isPolling = useRef(false);
  const scanningActive = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (screenState === "results") {
      successAnim.setValue(0);
      Animated.spring(successAnim, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [screenState]);

  useEffect(() => {
    if (screenState === "scanning") {
      startAnimations();
      startFaceDetectionPolling();
      return () => stopScan();
    }
  }, [screenState]);

  const toggleCameraFacing = () =>
    setFacing((current) => (current === "back" ? "front" : "back"));

  const startAnimations = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  };

  const startFaceDetectionPolling = () => {
    scanningActive.current = true;
    captureInProgress.current = false;

    faceCheckInterval.current = setInterval(async () => {
      if (
        !scanningActive.current ||
        captureInProgress.current ||
        isPolling.current ||
        !cameraRef.current
      )
        return;
      isPolling.current = true;

      try {
        const snapshot = await cameraRef.current.takePictureAsync({
          quality: 0.05,
          base64: true,
          skipProcessing: true,
        });
        if (!snapshot?.base64 || !scanningActive.current) return;

        const response = await faceInstance.post("/detect-face", {
          image: snapshot.base64,
        });
        if (!scanningActive.current) return;

        if (response.data.face_found) {
          setFaceDetected(true);
          if (response.data.locations && response.data.frame_width) {
            setFrameSize({
              width: response.data.frame_width,
              height: response.data.frame_height,
            });
            setFaceBoxes(response.data.locations);
          }

          if (!autoCaptureTimer.current) {
            autoCaptureTimer.current = setTimeout(() => {
              if (scanningActive.current && !captureInProgress.current)
                recordAttendance();
            }, 1200);
          }
        } else {
          setFaceDetected(false);
          setFaceBoxes([]);
          if (autoCaptureTimer.current) {
            clearTimeout(autoCaptureTimer.current);
            autoCaptureTimer.current = null;
          }
        }
      } catch (error: any) {
        // Silently handle
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
    setFaceBoxes([]);
  };

  const cancelScan = () => {
    stopScan();
    captureInProgress.current = false;
    setFaceDetected(false);
    setScreenState("idle");
  };

  // 🚀 LOGGING HELPER FUNCTION
  const saveToLocalLedger = async (results: GroupResult[]) => {
    try {
      const existing = await AsyncStorage.getItem("@device_scan_ledger");
      const parsed = existing ? JSON.parse(existing) : [];
      const newLogs = results.map((r) => ({
        id: Math.random().toString(36).substring(7),
        name: r.name,
        action: pendingAction,
        time: r.time || new Date().toISOString(),
        status: r.status,
      }));
      // Keep last 100 scans locally
      await AsyncStorage.setItem(
        "@device_scan_ledger",
        JSON.stringify([...newLogs, ...parsed].slice(0, 100)),
      );
    } catch (e) {
      console.error("Ledger Error", e);
    }
  };

  const recordAttendance = async () => {
    if (captureInProgress.current || !cameraRef.current) return;
    captureInProgress.current = true;
    stopScan();
    setFaceDetected(false);
    setScreenState("processing");

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        base64: true,
        skipProcessing: true,
      });
      if (!photo?.base64) {
        Alert.alert("Error", "Could not capture photo.");
        cancelScan();
        return;
      }

      const response = await coreApiClient.post("/attendance/mark", {
        image: photo.base64,
        action: pendingAction,
      });
      const data = response.data;

      if (data.success || data.results) {
        let finalResults: GroupResult[] = [];
        if (data.results && Array.isArray(data.results)) {
          finalResults = data.results;
        } else {
          finalResults = [
            {
              name: data.name || data.fo_name || "Unknown Operator",
              status: "success",
              message:
                data.message ||
                `Successfully marked ${pendingAction.replace("_", " ")}`,
              time:
                data.clock_in_at ||
                data.clock_out_at ||
                new Date().toISOString(),
            },
          ];
        }

        await saveToLocalLedger(finalResults); // Save to history
        setResultsList(finalResults);
        setScreenState("results");
      } else {
        Alert.alert(
          "Not Recognized",
          data.message || "Face not found in database.",
        );
        cancelScan();
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        const d = error.response.data;
        const res: GroupResult = {
          name: d.name || d.fo_name || "Operator",
          status: "warning",
          message: d.message || "Already clocked in/out.",
          time: d.clock_in_at || d.clock_out_at || new Date().toISOString(),
        };
        await saveToLocalLedger([res]); // Save duplicates to history too
        setResultsList([res]);
        setScreenState("results");
        return;
      }
      Alert.alert(
        "Error",
        error.code === "ECONNABORTED"
          ? "Request timed out."
          : error.response?.data?.message || "Unable to connect.",
      );
      cancelScan();
    }
  };

  const startScan = (action: AttendanceAction) => {
    captureInProgress.current = false;
    setPendingAction(action);
    setFaceDetected(false);
    setFaceBoxes([]);
    setScreenState("scanning");
  };

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_BOX_SIZE - 4],
  });

  const renderHeader = () => (
    <View style={S.header}>
      <TouchableOpacity
        onPress={() => navigation.openDrawer()}
        style={S.menuButton}
      >
        <Ionicons name="menu" size={28} color="#0EA5E9" />
      </TouchableOpacity>
      <View style={S.headerTextContainer}>
        <Text style={S.headerTitle}>ATTENDANCE</Text>
        <Text style={S.headerSubtitle}>BIOMETRIC SYSTEM</Text>
      </View>
      <TouchableOpacity
        onPress={() => navigation.navigate("DeviceHistory")}
        style={S.menuButton}
      >
        <Ionicons name="time-outline" size={24} color="#0EA5E9" />
      </TouchableOpacity>
    </View>
  );

  if (!permission) return <View style={S.container} />;
  if (!permission.granted)
    return /* Permission Screen omitted for brevity, same as before */ <View />;

  if (screenState === "scanning" || screenState === "processing") {
    // 🚀 THE FIX: Calculate a perfect 16:9 aspect ratio to prevent Android from cropping/zooming!
    const cameraHeight = width * (16 / 9);

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <StatusBar
          barStyle="light-content"
          translucent
          backgroundColor="transparent"
        />

        {/* 🚀 THE FIX: Wrap the camera in a strict aspect-ratio container */}
        <View
          style={{ width: width, height: cameraHeight, position: "absolute" }}
        >
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash="off"
            mute={true}
            zoom={-30}
          />

          {/* Dynamic Face Boxes (Inside the wrapper so the green boxes stay accurate!) */}
          {screenState === "scanning"
            ? faceBoxes.map((box, index) => {
                const topP = (box.top / frameSize.height) * 100;
                const widthP = ((box.right - box.left) / frameSize.width) * 100;
                const heightP =
                  ((box.bottom - box.top) / frameSize.height) * 100;
                let leftP = (box.left / frameSize.width) * 100;

                if (facing === "front") {
                  leftP = 100 - leftP - widthP;
                }

                return (
                  <View
                    key={index}
                    style={{
                      position: "absolute",
                      borderWidth: 2,
                      borderColor: "#4ADE80",
                      backgroundColor: "rgba(74, 222, 128, 0.25)",
                      top: `${topP}%`,
                      left: `${leftP}%`,
                      width: `${widthP}%`,
                      height: `${heightP}%`,
                      zIndex: 5,
                      borderRadius: 8,
                    }}
                  />
                );
              })
            : null}
        </View>

        {/* Overlay UI (Scanners, Buttons, Text) remains full screen over the camera */}
        <View style={S.overlay}>
          <View
            style={[
              S.overlayBlock,
              {
                flex: 1,
                justifyContent: "space-between",
                flexDirection: "row",
                alignItems: "flex-end",
                paddingBottom: 24,
                paddingHorizontal: 20,
              },
            ]}
          >
            <View style={{ width: 44 }} />
            <View style={{ alignItems: "center" }}>
              <Text style={S.scanTitle}>
                {screenState === "processing"
                  ? "VERIFYING FACES..."
                  : pendingAction === "clock_in"
                    ? "GROUP CLOCK IN"
                    : "GROUP CLOCK OUT"}
              </Text>
              <Text style={S.scanSubtitle}>
                {screenState === "processing"
                  ? "Matching with database"
                  : "Position all operators in frame"}
              </Text>
            </View>
            <TouchableOpacity onPress={toggleCameraFacing} style={S.flipBtn}>
              <Ionicons name="camera-reverse" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", height: SCAN_BOX_SIZE }}>
            <View style={[S.overlayBlock, { flex: 1 }]} />
            <Animated.View
              style={[S.scanBox, { transform: [{ scale: pulseAnim }] }]}
            >
              {(["cornerTL", "cornerTR", "cornerBL", "cornerBR"] as const).map(
                (c) => (
                  <View
                    key={c}
                    style={[
                      S.corner,
                      S[c],
                      faceDetected ? S.cornerGreen : null,
                    ]}
                  />
                ),
              )}
              {screenState === "scanning" ? (
                <Animated.View
                  style={[
                    S.scanLine,
                    { transform: [{ translateY: scanLineTranslate }] },
                    faceDetected ? S.scanLineGreen : null,
                  ]}
                />
              ) : null}
              {screenState === "processing" ? (
                <View style={S.processingOverlay}>
                  <ActivityIndicator size="large" color="#4ADE80" />
                </View>
              ) : null}
            </Animated.View>
            <View style={[S.overlayBlock, { flex: 1 }]} />
          </View>

          <View
            style={[
              S.overlayBlock,
              { flex: 1, paddingTop: 28, alignItems: "center" },
            ]}
          >
            <View style={S.statusRow}>
              <View
                style={[S.statusDot, faceDetected ? S.statusDotGreen : null]}
              />
              <Text
                style={[S.statusText, faceDetected ? S.statusTextGreen : null]}
              >
                {screenState === "processing"
                  ? "Processing..."
                  : faceDetected
                    ? `Faces detected — hold still...`
                    : "Scanning for faces..."}
              </Text>
            </View>
            {screenState === "scanning" ? (
              <TouchableOpacity onPress={cancelScan} style={S.cancelBtn}>
                <Text style={S.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#080C18", "#0D1120", "#080C18"]}
      style={S.container}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {renderHeader()}

        {screenState === "results" ? (
          <ScrollView
            contentContainerStyle={S.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                transform: [{ scale: successAnim }],
                opacity: successAnim,
              }}
            >
              <Text style={S.resultsHeaderTitle}>SCAN RESULTS</Text>
              <Text style={S.resultsHeaderSubtitle}>
                {resultsList.length} OPERATOR(S) RECOGNIZED
              </Text>

              {resultsList.map((res, i) => {
                const isError = res.status === "error";
                const isWarning = res.status === "warning";
                const color = isError
                  ? "#EF4444"
                  : isWarning
                    ? "#F59E0B"
                    : "#10B981";
                const iconName = isError
                  ? "close-circle"
                  : isWarning
                    ? "alert-circle"
                    : "checkmark-circle";

                return (
                  <BlurView
                    key={i}
                    intensity={20}
                    tint="dark"
                    style={[
                      S.glassCard,
                      {
                        borderColor: `rgba(${color.replace("#", "")}, 0.3)`,
                        marginBottom: 16,
                      },
                    ]}
                  >
                    <View style={S.resultHeaderRow}>
                      <Ionicons
                        name={iconName}
                        size={28}
                        color={color}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={S.resultNameText}>
                        {res.name.toUpperCase()}
                      </Text>
                    </View>
                    <View style={S.resultDetailsRow}>
                      <Text
                        style={[
                          S.resultMessageText,
                          { color: isError ? "#FCA5A5" : "#94A3B8" },
                        ]}
                      >
                        {res.message}
                      </Text>
                      {res.time && (
                        <Text style={S.resultTimeText}>
                          {formatPKT(res.time)}
                        </Text>
                      )}
                    </View>
                  </BlurView>
                );
              })}

              <TouchableOpacity
                style={S.doneBtn}
                onPress={() => setScreenState("idle")}
              >
                <Ionicons
                  name="checkmark"
                  size={20}
                  color="#080C18"
                  style={{ marginRight: 8 }}
                />
                <Text style={S.doneBtnText}>DONE</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={S.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={S.idleContent}>
              <View style={S.bigIconCircle}>
                <Ionicons name="people-outline" size={60} color="#0EA5E9" />
              </View>
              <Text style={S.title}>BIOMETRIC LOCK</Text>
              <Text style={S.subtitle}>
                Scan your face (or your team) {"\n"}to record attendance for{" "}
                {"\n"}
                {getPKTDateString()}
              </Text>

              <TouchableOpacity
                style={S.clockInBtn}
                onPress={() => startScan("clock_in")}
              >
                <Ionicons
                  name="log-in-outline"
                  size={24}
                  color="#10B981"
                  style={{ marginRight: 8 }}
                />
                <Text style={S.clockInBtnText}>SCAN TO CLOCK IN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={S.clockOutBtn}
                onPress={() => startScan("clock_out")}
              >
                <Ionicons
                  name="log-out-outline"
                  size={24}
                  color="#EF4444"
                  style={{ marginRight: 8 }}
                />
                <Text style={S.clockOutBtnText}>SCAN TO CLOCK OUT</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const C_DEFAULT = "rgba(255,255,255,0.55)";
const C_GREEN = "#10B981";
const C_SIZE = 22;
const C_THICK = 3;

const S = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { flexGrow: 1, paddingBottom: 40, paddingTop: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 20 : 0,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(14, 165, 233, 0.2)",
  },
  menuButton: {
    padding: 8,
    backgroundColor: "rgba(14, 165, 233, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.3)",
  },
  headerTextContainer: { alignItems: "center" },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 1,
  },
  idleContent: { alignItems: "center", paddingHorizontal: 32, marginTop: 40 },
  bigIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(14, 165, 233, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 8,
    letterSpacing: 2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
  },
  clockInBtn: {
    flexDirection: "row",
    width: "100%",
    borderRadius: 12,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.4)",
    marginBottom: 16,
  },
  clockInBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#10B981",
    letterSpacing: 1,
  },
  clockOutBtn: {
    flexDirection: "row",
    width: "100%",
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  clockOutBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#EF4444",
    letterSpacing: 1,
  },
  resultsHeaderTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 2,
    marginTop: 10,
  },
  resultsHeaderSubtitle: {
    fontSize: 12,
    color: "#0EA5E9",
    textAlign: "center",
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 30,
  },
  glassCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingBottom: 12,
  },
  resultNameText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#F8FAFC",
    letterSpacing: 1,
  },
  resultDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultMessageText: { fontSize: 12, flex: 1, marginRight: 10, lineHeight: 18 },
  resultTimeText: { fontSize: 14, fontWeight: "800", color: "#F8FAFC" },
  doneBtn: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: "#0EA5E9",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0EA5E9",
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#080C18",
    letterSpacing: 1,
  },
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: "column" },
  overlayBlock: {
    backgroundColor: "rgba(5, 11, 20, 0.85)",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  scanTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  scanSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 6,
    letterSpacing: 1,
  },
  scanBox: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    position: "relative",
    overflow: "hidden",
  },
  corner: { position: "absolute", width: C_SIZE, height: C_SIZE },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: C_THICK,
    borderLeftWidth: C_THICK,
    borderColor: C_DEFAULT,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: C_THICK,
    borderRightWidth: C_THICK,
    borderColor: C_DEFAULT,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: C_THICK,
    borderLeftWidth: C_THICK,
    borderColor: C_DEFAULT,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: C_THICK,
    borderRightWidth: C_THICK,
    borderColor: C_DEFAULT,
    borderBottomRightRadius: 8,
  },
  cornerGreen: { borderColor: C_GREEN },
  scanLine: {
    position: "absolute",
    left: 4,
    right: 4,
    height: 2,
    backgroundColor: "rgba(14, 165, 233, 0.7)",
    borderRadius: 1,
  },
  scanLineGreen: { backgroundColor: "rgba(16, 185, 129, 0.8)" },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 11, 20, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#334155",
  },
  statusDotGreen: { backgroundColor: C_GREEN },
  statusText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  statusTextGreen: { color: C_GREEN },
  flipBtn: {
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
  },
  cancelBtn: {
    marginTop: "auto",
    marginBottom: 48,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cancelBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
