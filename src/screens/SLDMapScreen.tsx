import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Polygon as SvgPolygon } from "react-native-svg";
import Toast from "react-native-toast-message";

const PIN_SIZE = 40;
const TABS = ["BEFORE", "ANNOTATE", "AFTER"] as const;
type Tab = (typeof TABS)[number];

export const SERVER_BASE = "https://app.sowashusa.com";
const REQUIRED_WAIT_SECONDS = 10 * 60;
const OFFLINE_QUEUE_KEY = "@sowash_offline_queue";

type QueuedAction = {
  id: string;
  type: "EVENT" | "PHOTO" | "ANNOTATION" | "TPT";
  jobId: string;
  payload: any;
};
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

type Point = {
  id: number;
  label?: string;
  x_percent: number;
  y_percent: number;
};
type StringShape = {
  id: number;
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
};
type PinStatus = {
  beforeUri?: string;
  beforeUploaded: boolean;
  beforePerformedAt?: string;
  annotationSaved: boolean;
  afterUri?: string;
  afterUploaded: boolean;
  afterPerformedAt?: string;
};

export default function SLDMapScreen({ navigation, route }: any) {
  const { jobId, diagram } = route.params || {};
  const points: Point[] = diagram?.points ?? [];
  const imageUrl = diagram?.diagram_url
    ? `${SERVER_BASE}${diagram.diagram_url}`
    : null;

  const [containerLayout, setContainerLayout] = useState({
    width: 1,
    height: 1,
  });
  const [imageNatural, setImageNatural] = useState({ width: 1, height: 1 });
  const [imageLoading, setImageLoading] = useState(true);

  const [jobStep, setJobStep] = useState(-1);
  const [firingEvent, setFiringEvent] = useState(false);
  const currentJobIdRef = useRef<string | null>(null);
  const [fsrDone, setFsrDone] = useState(false);
  const [gateTime, setGateTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(REQUIRED_WAIT_SECONDS);

  const [phase, setPhase] = useState<
    "overview" | "at_gate" | "at_panel" | "completed"
  >("overview");

  const [jobStrings, setJobStrings] = useState<StringShape[]>([]);
  const [jobStringFlags, setJobStringFlags] = useState<number[]>([]);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const [pinStatuses, setPinStatuses] = useState<Record<number, PinStatus>>({});
  const [selectedPin, setSelectedPin] = useState<Point | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("BEFORE");
  const [note, setNote] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [saving, setSaving] = useState(false);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"before" | "after">(
    "before",
  );
  const cameraRef = useRef<CameraView>(null);

  const [offlineQueue, setOfflineQueue] = useState<QueuedAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // ─── INIT & RESET ───
  // ─── INIT & RESET ───
  useEffect(() => {
    if (!jobId) return;

    if (currentJobIdRef.current !== jobId) {
      setGateTime(null);
      setTimeRemaining(REQUIRED_WAIT_SECONDS);
      setSelectedPin(null);
      setShowCamera(false);
      setPhase("overview");

      const initialPins: Record<number, PinStatus> = {};
      for (const p of (diagram?.points ?? []) as Point[]) {
        initialPins[p.id] = {
          beforeUploaded: false,
          annotationSaved: false,
          afterUploaded: false,
        };
      }
      setPinStatuses(initialPins);
      currentJobIdRef.current = jobId;
    }

    loadGateTime();
    loadJobStep();
    loadExistingServerData();
    loadStrings();
  }, [jobId]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  // Track if we've already fired the events so we don't spam the server
  const workStartedFired = useRef(false);
  const workFinishedFired = useRef(false);

  // 🚀 CRITICAL FIX: Automatically fire Start/Finish timestamps!
  useEffect(() => {
    if (!points || points.length === 0 || phase !== "at_panel") return;

    // Count how many pins have a Before photo and After photo uploaded/saved
    const beforeCount = Object.values(pinStatuses).filter(
      (s) => s.beforeUploaded,
    ).length;
    const afterCount = Object.values(pinStatuses).filter(
      (s) => s.afterUploaded,
    ).length;

    // 1. If they took their first BEFORE photo, fire WORK STARTED
    if (beforeCount >= 1 && !workStartedFired.current) {
      workStartedFired.current = true;
      fireEvent("work_started");
    }

    // 2. If they finished their last AFTER photo, fire WORK FINISHED
    if (
      afterCount === points.length &&
      points.length > 0 &&
      !workFinishedFired.current
    ) {
      workFinishedFired.current = true;
      fireEvent("work_finished");
    }
  }, [pinStatuses, phase, points.length]);

  // ─── OFFLINE MANAGER ───
  // ─── OFFLINE MANAGER ───
  useFocusEffect(
    React.useCallback(() => {
      const checkData = async () => {
        try {
          // 1. Load the offline queue
          const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
          if (stored) setOfflineQueue(JSON.parse(stored));

          // 2. 🚀 Instantly check if the FSR was completed locally
          const fsrFlag = await AsyncStorage.getItem(`@fsr_done_${jobId}`);
          if (fsrFlag === "true") setFsrDone(true);

          // 3. Re-fetch server status just in case
          loadJobStep();
        } catch (e) {}
      };
      checkData();
    }, [jobId]),
  );

  const saveToOfflineQueue = async (action: Omit<QueuedAction, "id">) => {
    try {
      const newAction = { ...action, id: Date.now().toString() };
      const updatedQueue = [...offlineQueue, newAction];
      setOfflineQueue(updatedQueue);
      await AsyncStorage.setItem(
        OFFLINE_QUEUE_KEY,
        JSON.stringify(updatedQueue),
      );
    } catch (e) {
      Toast.show({ type: "error", text1: "Failed to save offline." });
    }
  };

  const processOfflineQueue = async () => {
    const network = await Network.getNetworkStateAsync();
    if (!network.isConnected) {
      Toast.show({
        type: "error",
        text1: "Still Offline",
        text2: "Connect to internet to sync.",
      });
      return;
    }
    if (offlineQueue.length === 0) return;

    setIsSyncing(true);
    const token = await SecureStore.getItemAsync("userToken");
    let remainingQueue = [...offlineQueue];

    for (const action of offlineQueue) {
      try {
        if (action.type === "EVENT") {
          await fetch(`${SERVER_BASE}/api/mideast/jobs/${action.jobId}/event`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(action.payload),
          });
        } else if (action.type === "PHOTO") {
          const form = new FormData();
          form.append("photo", {
            uri: action.payload.uri,
            type: "image/jpeg",
            name: action.payload.name,
          } as any);
          form.append("point_id", action.payload.point_id);
          form.append("photo_type", action.payload.photo_type);
          form.append("taken_at", action.payload.taken_at);
          await fetch(
            `${SERVER_BASE}/api/mideast/point-photos/job/${action.jobId}`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            },
          );
        } else if (action.type === "ANNOTATION") {
          await fetch(
            `${SERVER_BASE}/api/mideast/fo-annotations/job/${action.jobId}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(action.payload),
            },
          );
        } else if (action.type === "TPT") {
          // 🚀 Added TPT Offline handling
          const form = new FormData();
          form.append("photo", {
            uri: action.payload.uri,
            type: "image/jpeg",
            name: "tpt.jpg",
          } as any);
          form.append("taken_at", action.payload.taken_at);
          await fetch(
            `${SERVER_BASE}/api/mideast/jobs/${action.jobId}/tpt-photo`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            },
          );
        } else if (action.type === "FSR") {
          // 🚀 NEW: Added FSR Offline handling
          await fetch(`${SERVER_BASE}/api/mideast/jobs/${action.jobId}/fsr`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(action.payload),
          });
        }

        // Only removes the item from the queue if the fetch succeeds without throwing an error
        remainingQueue = remainingQueue.filter((q) => q.id !== action.id);
        setOfflineQueue(remainingQueue);
        await AsyncStorage.setItem(
          OFFLINE_QUEUE_KEY,
          JSON.stringify(remainingQueue),
        );
      } catch (e) {
        console.error("Sync failed for item:", action.id);
      }
    }

    setIsSyncing(false);

    if (remainingQueue.length === 0) {
      Toast.show({
        type: "success",
        text1: "Sync Complete!",
        text2: "All offline data uploaded.",
      });
    } else {
      Toast.show({
        type: "info",
        text1: "Partial Sync",
        text2: "Some items failed. Will retry later.",
      });
    }
  };

  // ─── CORE LOGIC ───
  const loadGateTime = async () => {
    try {
      const stored = await SecureStore.getItemAsync(`gateTime_${jobId}`);
      if (stored) {
        const time = parseInt(stored, 10);
        setGateTime(time);
        const elapsed = Math.floor((Date.now() - time) / 1000);
        setTimeRemaining(Math.max(0, REQUIRED_WAIT_SECONDS - elapsed));
      }
    } catch (e) {}
  };

  useEffect(() => {
    if ((jobStep === 0 || phase === "at_gate") && gateTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gateTime) / 1000);
        const remaining = Math.max(0, REQUIRED_WAIT_SECONDS - elapsed);
        setTimeRemaining(remaining);
        if (remaining === 0) clearInterval(interval);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [jobStep, phase, gateTime]);

  const loadJobStep = async () => {
    try {
      const token = await SecureStore.getItemAsync("userToken");
      const res = await fetch(`${SERVER_BASE}/api/mideast/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : null;
      const status = data?.job?.status ?? "scheduled";
      const stepVal = STATUS_TO_STEP[status] ?? -1;
      setJobStep(stepVal);

      // 🚀 CRITICAL FIX: Only set the map to 'completed' if they actually left the site!
      const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      let hasOfflineExit = false;

      if (stored) {
        const q = JSON.parse(stored);
        // Look for the site_exited event, NOT the FSR!
        hasOfflineExit = q.some(
          (item: any) =>
            item.type === "EVENT" &&
            item.jobId === jobId &&
            item.payload?.event === "site_exited",
        );
      }

      // ONLY set phase to completed if the server says so OR they clicked Leave Site!
      if (hasOfflineExit || stepVal >= 4) {
        setPhase("completed");
      } else if (stepVal >= 1) {
        setPhase("at_panel");
      } else if (stepVal === 0) {
        setPhase("at_gate");
      }
    } catch {}
  };

  const loadExistingServerData = async () => {
    try {
      const token = await SecureStore.getItemAsync("userToken");
      const [photosRes, annotationsRes] = await Promise.all([
        fetch(`${SERVER_BASE}/api/mideast/point-photos/job/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${SERVER_BASE}/api/mideast/fo-annotations/job/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (photosRes.ok && annotationsRes.ok) {
        const photos = await photosRes.json();
        const annotations = await annotationsRes.json();
        const pArr = Array.isArray(photos) ? photos : (photos.photos ?? []);
        const aArr = Array.isArray(annotations)
          ? annotations
          : (annotations.annotations ?? []);
        setPinStatuses((prev) => {
          const next = { ...prev };
          for (const p of pArr) {
            if (next[p.point_id])
              next[p.point_id][
                p.photo_type === "before" ? "beforeUploaded" : "afterUploaded"
              ] = true;
          }
          for (const a of aArr) {
            if (next[a.point_id]) next[a.point_id].annotationSaved = true;
          }
          return next;
        });
      }
    } catch {}
  };

  const loadStrings = async () => {
    if (!diagram?.id) return;
    try {
      const token = await SecureStore.getItemAsync("userToken");
      const [stringsRes, flagsRes] = await Promise.all([
        fetch(`${SERVER_BASE}/api/mideast/strings/diagram/${diagram.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${SERVER_BASE}/api/mideast/strings/job/${jobId}/flags`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (stringsRes.ok) setJobStrings((await stringsRes.json()).strings || []);
      if (flagsRes.ok)
        setJobStringFlags(
          ((await flagsRes.json()).flags || []).map((f: any) => f.string_id),
        );
    } catch {}
  };

  const fireEvent = async (eventKey: string) => {
    const performedAt = new Date().toISOString();
    setJobStep(EVENT_TO_STEP[eventKey]);
    const payload = {
      event: eventKey,
      timestamp: performedAt,
      lat: null,
      lng: null,
    };
    const network = await Network.getNetworkStateAsync();

    if (!network.isConnected) {
      await saveToOfflineQueue({ type: "EVENT", jobId, payload });
      return;
    }
    const token = await SecureStore.getItemAsync("userToken");
    try {
      await fetch(`${SERVER_BASE}/api/mideast/jobs/${jobId}/event`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      await saveToOfflineQueue({ type: "EVENT", jobId, payload });
    }
  };

  // ─── EXECUTION PROTOCOL HANDLERS ───
  const handleReachGate = async () => {
    setFiringEvent(true);
    const now = Date.now();
    setGateTime(now);
    setTimeRemaining(REQUIRED_WAIT_SECONDS);
    setPhase("at_gate");
    SecureStore.setItemAsync(`gateTime_${jobId}`, now.toString()).catch(
      () => {},
    );
    await fireEvent("reached_site");
    Toast.show({
      type: "success",
      text1: "Gate Reached",
      text2: "Wait for transit timer.",
    });
    setFiringEvent(false);
  };

  const handleReachPanel = async () => {
    setFiringEvent(true);
    setPhase("at_panel");
    await fireEvent("reached_panels");
    Toast.show({
      type: "success",
      text1: "Panel Reached",
      text2: "FSR unlocked.",
    });
    setFiringEvent(false);
  };

  // ─── EVENT HANDLERS ───
  const handleManualEvent = async (eventKey: string) => {
    setFiringEvent(true);

    // 🚀 NEW: Explicit Leave Site action
    if (eventKey === "site_exited") {
      await fireEvent("site_exited");
      setPhase("completed");
      setFiringEvent(false);
      Toast.show({
        type: "success",
        text1: "Job Completed!",
        text2: "You have safely logged out of the site.",
      });

      // Go back to the dashboard after a short delay
      setTimeout(() => {
        navigation.navigate("JobOrders"); // Or navigation.goBack()
      }, 1500);
      return;
    }

    if (eventKey === "reached_site") {
      const now = Date.now();
      setGateTime(now);
      setTimeRemaining(REQUIRED_WAIT_SECONDS);
      setPhase("at_gate");
      SecureStore.setItemAsync(`gateTime_${jobId}`, now.toString()).catch(
        () => {},
      );
    }
    if (eventKey === "reached_panels") setPhase("at_panel");

    await fireEvent(eventKey);
    setFiringEvent(false);
  };

  // ─── CAMERA LOGIC ───
  const launchPinCamera = async (target: "before" | "after") => {
    if (!camPermission?.granted) {
      const result = await requestCamPermission();
      if (!result.granted) {
        Alert.alert("Permission Required", "Camera access is needed.");
        return;
      }
    }
    setCameraTarget(target);
    setShowCamera(true);
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
            : { afterUri: photo.uri, afterPerformedAt: performedAt }),
        },
      }));
    } catch {
      Toast.show({ type: "error", text1: "Camera Error" });
    }
  };

  const confirmPhoto = async (type: "before" | "after") => {
    if (!selectedPin) return;
    const status = pinStatuses[selectedPin.id];
    const uri = type === "before" ? status?.beforeUri : status?.afterUri;
    const performedAt =
      type === "before" ? status?.beforePerformedAt : status?.afterPerformedAt;
    if (!uri || !performedAt) return;

    setSaving(true);
    setPinStatuses((prev) => ({
      ...prev,
      [selectedPin.id]: {
        ...prev[selectedPin.id],
        ...(type === "before"
          ? { beforeUploaded: true }
          : { afterUploaded: true }),
      },
    }));

    const payload = {
      uri: uri,
      point_id: String(selectedPin.id),
      photo_type: type,
      taken_at: performedAt, // <--- 8:30 AM is locked in here!
      name: `${type}-${selectedPin.id}.jpg`,
    };
    const network = await Network.getNetworkStateAsync();

    if (!network.isConnected) {
      await saveToOfflineQueue({ type: "PHOTO", jobId, payload });
      Toast.show({ type: "info", text1: "Saved Offline" });
      setSaving(false);
      if (type === "before") setActiveTab("ANNOTATE");
      else closeModal();
      return;
    }

    const token = await SecureStore.getItemAsync("userToken");
    try {
      const form = new FormData();
      form.append("photo", {
        uri: payload.uri,
        type: "image/jpeg",
        name: payload.name,
      } as any);
      form.append("point_id", payload.point_id);
      form.append("photo_type", payload.photo_type);
      form.append("taken_at", payload.taken_at);
      await fetch(`${SERVER_BASE}/api/mideast/point-photos/job/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      Toast.show({ type: "success", text1: "Photo uploaded." });
    } catch {
      await saveToOfflineQueue({ type: "PHOTO", jobId, payload });
      Toast.show({ type: "info", text1: "Saved Offline" });
    } finally {
      setSaving(false);
      if (type === "before") setActiveTab("ANNOTATE");
      else closeModal();
    }
  };

  const saveAnnotation = async () => {
    if (!selectedPin) return;
    const annotatedAt = new Date().toISOString();
    setSaving(true);

    setPinStatuses((prev) => ({
      ...prev,
      [selectedPin.id]: { ...prev[selectedPin.id], annotationSaved: true },
    }));
    const payload = {
      point_id: selectedPin.id,
      note: note.trim() || "No observation noted.",
      flag: flagged,
      annotated_at: annotatedAt,
    };

    const network = await Network.getNetworkStateAsync();
    if (!network.isConnected) {
      await saveToOfflineQueue({ type: "ANNOTATION", jobId, payload });
      Toast.show({ type: "info", text1: "Saved Offline" });
      setSaving(false);
      setActiveTab("AFTER");
      return;
    }

    const token = await SecureStore.getItemAsync("userToken");
    try {
      await fetch(`${SERVER_BASE}/api/mideast/fo-annotations/job/${jobId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      Toast.show({ type: "success", text1: "Annotation saved." });
    } catch {
      await saveToOfflineQueue({ type: "ANNOTATION", jobId, payload });
    } finally {
      setSaving(false);
      setActiveTab("AFTER");
    }
  };

  // ─── UI Rendering Helpers ───
  const getRenderedImageRect = useCallback(() => {
    const cA = containerLayout.width / containerLayout.height;
    const iA = imageNatural.width / imageNatural.height;
    let rW: number, rH: number, oX: number, oY: number;
    if (iA > cA) {
      rW = containerLayout.width;
      rH = rW / iA;
      oX = 0;
      oY = (containerLayout.height - rH) / 2;
    } else {
      rH = containerLayout.height;
      rW = rH * iA;
      oX = (containerLayout.width - rW) / 2;
      oY = 0;
    }
    return { rW, rH, oX, oY };
  }, [containerLayout, imageNatural]);

  const getPinStyle = (point: Point) => {
    const { rW, rH, oX, oY } = getRenderedImageRect();
    return {
      left: oX + (point.x_percent / 100) * rW - PIN_SIZE / 2,
      top: oY + (point.y_percent / 100) * rH - PIN_SIZE / 2,
    };
  };

  const toSvgPoints = (polygonPoints: Array<{ x: number; y: number }>) => {
    const { rW, rH, oX, oY } = getRenderedImageRect();
    return polygonPoints
      .map((p) => `${oX + (p.x / 100) * rW},${oY + (p.y / 100) * rH}`)
      .join(" ");
  };

  const getCentroid = (polygonPoints: Array<{ x: number; y: number }>) => {
    const { rW, rH, oX, oY } = getRenderedImageRect();
    const cx =
      oX +
      (polygonPoints.reduce((s, p) => s + p.x, 0) /
        polygonPoints.length /
        100) *
        rW;
    const cy =
      oY +
      (polygonPoints.reduce((s, p) => s + p.y, 0) /
        polygonPoints.length /
        100) *
        rH;
    return { cx, cy };
  };

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

  const doneCount = points.filter((p) => pinDone(p.id)).length;
  const pinsLocked = phase === "overview" || phase === "at_gate";

  const openPin = (point: Point) => {
    if (pinsLocked) return;
    setSelectedPin(point);
    setActiveTab("BEFORE");
    setNote("");
    setFlagged(false);
    setShowCamera(false);
  };
  const closeModal = () => {
    setSelectedPin(null);
    setShowCamera(false);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const renderPhotoTab = (type: "before" | "after") => {
    if (!selectedPin) return null;
    const status = pinStatuses[selectedPin.id];
    const uri = type === "before" ? status?.beforeUri : status?.afterUri;
    const uploaded =
      type === "before" ? status?.beforeUploaded : status?.afterUploaded;
    const locked = type === "after" && !status?.annotationSaved;

    if (locked)
      return (
        <View style={styles.tabContent}>
          <Ionicons name="lock-closed" size={48} color="#1E2A45" />
          <Text style={styles.lockedText}>
            Complete the Annotate step first.
          </Text>
        </View>
      );

    if (uri)
      return (
        <View style={styles.tabContent}>
          <Image
            source={{ uri }}
            style={styles.photoPreview}
            resizeMode="cover"
          />
          {uploaded ? (
            <View style={styles.statusBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#22D3A5" />
              <Text style={[styles.statusBadgeText, { color: "#22D3A5" }]}>
                Saved
              </Text>
            </View>
          ) : (
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => launchPinCamera(type)}
              >
                <Ionicons name="camera" size={16} color="#94A3B8" />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, saving && styles.btnDisabled]}
                onPress={() => confirmPhoto(type)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#080C18" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#080C18" />
                    <Text style={styles.confirmBtnText}>Confirm</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      );

    return (
      <View style={styles.tabContent}>
        <Ionicons
          name={type === "before" ? "camera-outline" : "checkmark-done-outline"}
          size={64}
          color="#1E2A45"
        />
        <Text style={styles.photoPrompt}>
          {type === "before"
            ? "Capture panel BEFORE cleaning."
            : "Capture panel AFTER cleaning."}
        </Text>
        <TouchableOpacity
          style={styles.takePhotoBtn}
          onPress={() => launchPinCamera(type)}
        >
          <Ionicons name="camera" size={20} color="#080C18" />
          <Text style={styles.takePhotoBtnText}>Open Camera</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderAnnotateTab = () => {
    if (!selectedPin) return null;
    const status = pinStatuses[selectedPin.id];
    if (status?.annotationSaved)
      return (
        <View style={styles.tabContent}>
          <Ionicons name="checkmark-circle" size={64} color="#22D3A5" />
          <Text style={[styles.photoPrompt, { color: "#22D3A5" }]}>
            Annotation saved.
          </Text>
        </View>
      );
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.tabContent}
      >
        <Text style={styles.fieldLabel}>OBSERVATION NOTE</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Describe what you observed..."
          placeholderTextColor="#475569"
          multiline
          numberOfLines={4}
          value={note}
          onChangeText={setNote}
        />
        <TouchableOpacity
          style={[styles.flagRow, flagged && styles.flagRowActive]}
          onPress={() => setFlagged((f) => !f)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={flagged ? "flag" : "flag-outline"}
            size={20}
            color={flagged ? "#EF4444" : "#475569"}
          />
          <Text style={[styles.flagText, flagged && { color: "#EF4444" }]}>
            {flagged ? "FLAGGED — Issue Reported" : "Flag for Attention"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveAnnotationBtn, saving && styles.btnDisabled]}
          onPress={saveAnnotation}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#080C18" />
          ) : (
            <>
              <Ionicons name="save" size={18} color="#080C18" />
              <Text style={styles.saveAnnotationText}>SAVE ANNOTATION</Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  };

  const flaggedCount = jobStringFlags.length;
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  return (
    <LinearGradient colors={["#080C18", "#0D1120"]} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#0EA5E9" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {diagram?.title ?? "SITE MAP"}
            </Text>
            <Text style={styles.headerSub}>
              {doneCount}/{points.length} PINS DONE
            </Text>
          </View>
          {offlineQueue.length > 0 ? (
            <TouchableOpacity
              onPress={processOfflineQueue}
              style={styles.syncBtn}
            >
              {isSyncing ? (
                <ActivityIndicator color="#F59E0B" size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={18} color="#F59E0B" />
                  <Text style={styles.syncBtnText}>{offlineQueue.length}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {offlineQueue.length > 0 && !isSyncing && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={14} color="#94A3B8" />
            <Text style={styles.offlineBannerText}>
              Working Offline — {offlineQueue.length} items waiting to sync.
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── DIAGRAM AREA ── */}
          <View
            style={styles.diagramContainer}
            onLayout={(e) =>
              setContainerLayout({
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              })
            }
          >
            {imageUrl && (
              <>
                <Image
                  source={{ uri: imageUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                  onLoad={(e) => {
                    setImageNatural({
                      width: e.nativeEvent.source.width,
                      height: e.nativeEvent.source.height,
                    });
                    setImageLoading(false);
                  }}
                />
                {imageLoading && (
                  <View style={styles.imageLoader}>
                    <ActivityIndicator size="large" color="#0EA5E9" />
                    <Text style={styles.imageLoaderText}>
                      LOADING DIAGRAM...
                    </Text>
                  </View>
                )}
              </>
            )}

            {!imageLoading && jobStrings.length > 0 && (
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                {jobStrings.map((s) => {
                  const pts = Array.isArray(s.points) ? s.points : [];
                  if (pts.length < 3) return null;
                  const isFlagged = jobStringFlags.includes(s.id);
                  return (
                    <SvgPolygon
                      key={s.id}
                      points={toSvgPoints(pts)}
                      fill={isFlagged ? `${s.color}55` : `${s.color}20`}
                      stroke={s.color}
                      strokeWidth={isFlagged ? 2.5 : 1.5}
                      strokeOpacity={isFlagged ? 1 : 0.55}
                    />
                  );
                })}
              </Svg>
            )}

            {!imageLoading &&
              points.map((point, idx) => {
                const state = getPinState(point.id);
                const pinBg = pinsLocked
                  ? "#1E2A45"
                  : state === "done"
                    ? "#22D3A5"
                    : state === "before"
                      ? "#F59E0B"
                      : "#0EA5E9";
                return (
                  <TouchableOpacity
                    key={point.id}
                    style={[styles.pinWrapper, getPinStyle(point)]}
                    onPress={() => openPin(point)}
                    activeOpacity={pinsLocked ? 1 : 0.8}
                  >
                    <View
                      style={[
                        styles.pinDot,
                        {
                          backgroundColor: pinBg,
                          borderColor: pinsLocked ? "#2D3A50" : "#fff",
                        },
                      ]}
                    >
                      {state === "done" && !pinsLocked ? (
                        <Ionicons name="checkmark" size={16} color="#080C18" />
                      ) : state === "before" && !pinsLocked ? (
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color="#080C18"
                        />
                      ) : (
                        <Text
                          style={[
                            styles.pinIndex,
                            { color: pinsLocked ? "#2D3A50" : "#080C18" },
                          ]}
                        >
                          {idx + 1}
                        </Text>
                      )}
                    </View>
                    {point.label ? (
                      <View style={styles.pinLabelWrap}>
                        <Text style={styles.pinLabelText} numberOfLines={1}>
                          {point.label}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}

            {/* 🚀 LOCK OVERLAY */}
            {pinsLocked && !imageLoading && (
              <View style={styles.diagramLockOverlay}>
                <View style={styles.diagramLockCard}>
                  <Ionicons name="lock-closed" size={28} color="#475569" />
                  <Text style={styles.diagramLockText}>
                    {phase === "overview"
                      ? "Mark REACH GATE to begin"
                      : "Wait for transit timer to unlock panels"}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* ── EXECUTION PROTOCOL (The 3 Cards) ── */}
          <View style={styles.workflowContainer}>
            <Text style={styles.workflowTitle}>EXECUTION PROTOCOL</Text>

            {/* 1. REACH GATE */}
            <BlurView
              intensity={20}
              tint="dark"
              style={[
                styles.workflowCard,
                phase !== "overview" && styles.cardCompleted,
              ]}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name="business"
                  size={20}
                  color={phase !== "overview" ? "#10B981" : "#0EA5E9"}
                />
                <Text style={styles.cardTitle}>1. REACH SITE GATE</Text>
              </View>
              <Text style={styles.cardDescription}>
                Acknowledge arrival at the outer facility perimeter.
              </Text>

              {phase === "overview" ? (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleReachGate}
                >
                  <Text style={styles.actionBtnText}>MARK REACH GATE</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#10B981"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.completedText}>GATE REACHED</Text>
                </View>
              )}
            </BlurView>

            {/* 2. REACH PANEL */}
            <BlurView
              intensity={20}
              tint="dark"
              style={[
                styles.workflowCard,
                phase === "overview" && styles.cardDisabled,
                (phase === "at_panel" || phase === "completed") &&
                  styles.cardCompleted,
              ]}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name="hardware-chip"
                  size={20}
                  color={
                    phase === "at_panel" || phase === "completed"
                      ? "#10B981"
                      : phase === "at_gate"
                        ? "#0EA5E9"
                        : "#64748B"
                  }
                />
                <Text style={styles.cardTitle}>2. REACH PANEL</Text>
              </View>
              {phase === "overview" && (
                <Text style={styles.cardDescription}>
                  Complete previous step to unlock.
                </Text>
              )}

              {phase === "at_gate" && (
                <View style={styles.timerContainer}>
                  <Text style={styles.timerLabel}>MANDATORY WAIT</Text>
                  <Text
                    style={[
                      styles.timerValue,
                      timeRemaining === 0 && { color: "#10B981" },
                    ]}
                  >
                    {formatTime(timeRemaining)}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      timeRemaining > 0
                        ? styles.actionBtnLocked
                        : styles.actionBtnReady,
                    ]}
                    onPress={handleReachPanel}
                    disabled={timeRemaining > 0}
                  >
                    <Text
                      style={[
                        styles.actionBtnText,
                        timeRemaining === 0 && { color: "#080C18" },
                      ]}
                    >
                      {timeRemaining > 0 ? "LOCKED" : "MARK REACH PANEL"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {(phase === "at_panel" || phase === "completed") && (
                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#10B981"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.completedText}>PANEL REACHED</Text>
                </View>
              )}
            </BlurView>

            {/* 3. FSR FORM REDIRECT */}
            {/* 3. EXECUTION & FSR */}
            <BlurView
              intensity={20}
              tint="dark"
              style={[
                styles.workflowCard,
                phase !== "at_panel" &&
                  phase !== "completed" &&
                  styles.cardDisabled,
                (fsrDone || phase === "completed") && styles.cardCompleted,
              ]}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name="document-text"
                  size={20}
                  color={
                    fsrDone || phase === "completed"
                      ? "#10B981"
                      : phase === "at_panel"
                        ? "#0EA5E9"
                        : "#64748B"
                  }
                />
                <Text style={styles.cardTitle}>3. EXECUTION & FSR</Text>
              </View>
              <Text style={styles.cardDescription}>
                Complete all diagram pins, then fill out the final Field Service
                Report.
              </Text>

              {phase === "at_panel" && !fsrDone && (
                <View style={styles.fsrContainer}>
                  {doneCount === points.length && points.length > 0 ? (
                    // 🚀 Opens the FSR Screen Directly
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        { backgroundColor: "#10B981", borderColor: "#10B981" },
                      ]}
                      onPress={() =>
                        navigation.navigate("FSRScreen", { jobId })
                      }
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={20}
                        color="#080C18"
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={[styles.actionBtnText, { color: "#080C18" }]}
                      >
                        FILL FSR FORM
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          borderColor: "rgba(255, 255, 255, 0.1)",
                        },
                      ]}
                    >
                      <Ionicons
                        name="lock-closed"
                        size={16}
                        color="#94A3B8"
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={[styles.actionBtnText, { color: "#94A3B8" }]}
                      >
                        FINISH ALL PINS TO UNLOCK FSR
                      </Text>
                    </View>
                  )}
                </View>
              )}
              {(fsrDone || phase === "completed") && (
                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#10B981"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.completedText}>FSR COMPLETED</Text>
                </View>
              )}
            </BlurView>

            {/* 4. LEAVE SITE (NEW CARD) */}
            <BlurView
              intensity={20}
              tint="dark"
              style={[
                styles.workflowCard,
                !fsrDone && phase !== "completed" && styles.cardDisabled,
                phase === "completed" && styles.cardCompleted,
              ]}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name="exit"
                  size={20}
                  color={
                    phase === "completed"
                      ? "#10B981"
                      : fsrDone
                        ? "#F59E0B"
                        : "#64748B"
                  }
                />
                <Text style={styles.cardTitle}>4. LEAVE SITE</Text>
              </View>
              <Text style={styles.cardDescription}>
                Log out of the facility and formally complete this job.
              </Text>

              {fsrDone && phase !== "completed" && (
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: "#F59E0B",
                      borderColor: "#F59E0B",
                      marginTop: 10,
                    },
                  ]}
                  onPress={() => handleManualEvent("site_exited")}
                >
                  <Ionicons
                    name="exit-outline"
                    size={20}
                    color="#080C18"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.actionBtnText, { color: "#080C18" }]}>
                    COMPLETE JOB & LEAVE SITE
                  </Text>
                </TouchableOpacity>
              )}
              {phase === "completed" && (
                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#10B981"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.completedText}>JOB COMPLETED</Text>
                </View>
              )}
            </BlurView>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ── FULL SCREEN CAMERA WITH GHOST OVERLAY ── */}
      <Modal
        visible={showCamera}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowCamera(false)}
      >
        <View style={styles.tptModal}>
          <View style={styles.tptModalHeader}>
            <Text style={styles.tptModalTitle}>
              {cameraTarget === "before" ? "BEFORE PHOTO" : "AFTER PHOTO"}
            </Text>
            <TouchableOpacity onPress={() => setShowCamera(false)}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <View style={styles.tptCameraWrap}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              zoom={0}
            />

            {/* 🚀 Ghost Before Photo Display (Pin Specific) */}
            {cameraTarget === "after" &&
              selectedPin &&
              pinStatuses[selectedPin.id]?.beforeUri && (
                <View style={styles.cameraReference}>
                  <Text style={styles.cameraReferenceText}>BEFORE</Text>
                  <Image
                    source={{ uri: pinStatuses[selectedPin.id].beforeUri }}
                    style={styles.cameraReferenceImg}
                    resizeMode="cover"
                  />
                </View>
              )}

            <View style={styles.cameraControls}>
              <View style={{ width: 52 }} />
              <TouchableOpacity onPress={takePicture} style={styles.captureBtn}>
                <View style={styles.captureInner} />
              </TouchableOpacity>
              <View style={{ width: 52 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Pin Modal ── */}
      <Modal
        visible={!!selectedPin}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedPin?.label
                    ? selectedPin.label
                    : `Pin #${selectedPin?.id}`}
                </Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <View style={styles.tabBar}>
              {TABS.map((tab) => {
                const s = selectedPin ? pinStatuses[selectedPin.id] : null;
                const isDone =
                  tab === "BEFORE"
                    ? s?.beforeUploaded
                    : tab === "ANNOTATE"
                      ? s?.annotationSaved
                      : s?.afterUploaded;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.tabBtn,
                      activeTab === tab && styles.tabBtnActive,
                    ]}
                    onPress={() => setActiveTab(tab)}
                  >
                    {isDone && (
                      <Ionicons
                        name="checkmark-circle"
                        size={12}
                        color="#22D3A5"
                        style={{ marginRight: 4 }}
                      />
                    )}
                    <Text
                      style={[
                        styles.tabBtnText,
                        activeTab === tab && styles.tabBtnTextActive,
                      ]}
                    >
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalBody}>
              {activeTab === "BEFORE" && renderPhotoTab("before")}
              {activeTab === "ANNOTATE" && renderAnnotateTab()}
              {activeTab === "AFTER" && renderPhotoTab("after")}
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A45",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(14,165,233,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.3)",
  },
  headerCenter: { alignItems: "center" },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#F1F5F9",
    letterSpacing: 1,
  },
  headerSub: { fontSize: 11, color: "#94A3B8", letterSpacing: 1, marginTop: 2 },

  syncBtn: {
    flexDirection: "row",
    gap: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  syncBtnText: { color: "#F59E0B", fontSize: 12, fontWeight: "900" },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    backgroundColor: "#0D1120",
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A45",
  },
  offlineBannerText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  diagramContainer: {
    minHeight: 450,
    position: "relative",
    backgroundColor: "#080C18",
  },
  imageLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#080C18",
  },
  imageLoaderText: {
    color: "#0EA5E9",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 2,
    marginTop: 12,
  },
  diagramLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(8,12,24,0.75)",
  },
  diagramLockCard: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0D1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E2A45",
  },
  diagramLockText: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 20,
  },
  pinWrapper: { position: "absolute", alignItems: "center" },
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
  pinIndex: { fontSize: 13, fontWeight: "800" },
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

  workflowContainer: {
    padding: 20,
    paddingTop: 30,
    backgroundColor: "#0D1120",
  },
  workflowTitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
    marginLeft: 4,
  },
  workflowCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.2)",
    backgroundColor: "rgba(13, 17, 32, 0.7)",
  },
  cardDisabled: { opacity: 0.5, borderColor: "#1E2A45" },
  cardCompleted: { borderColor: "rgba(16, 185, 129, 0.4)" },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#F1F5F9",
    marginLeft: 8,
    letterSpacing: 1,
  },
  cardDescription: {
    fontSize: 12,
    color: "#94A3B8",
    lineHeight: 18,
    marginBottom: 20,
  },
  actionBtn: {
    flexDirection: "row",
    width: "100%",
    borderRadius: 12,
    backgroundColor: "rgba(14, 165, 233, 0.15)",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.4)",
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0EA5E9",
    letterSpacing: 1,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  completedText: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },

  timerContainer: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2A45",
  },
  timerLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  timerValue: {
    fontSize: 48,
    fontWeight: "300",
    color: "#F59E0B",
    fontVariant: ["tabular-nums"],
    marginBottom: 20,
  },
  actionBtnLocked: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  actionBtnReady: { backgroundColor: "#10B981", borderColor: "#10B981" },

  fsrContainer: { marginTop: 10 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0D1120",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "#1E2A45",
    maxHeight: "82%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A45",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#F1F5F9",
    letterSpacing: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E2A45",
    justifyContent: "center",
    alignItems: "center",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A45",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: "#0EA5E9" },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#475569",
    letterSpacing: 1,
  },
  tabBtnTextActive: { color: "#0EA5E9" },
  modalBody: { minHeight: 280 },
  tabContent: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 280,
  },
  lockedText: {
    color: "#475569",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  photoPreview: { width: "100%", height: 200, borderRadius: 12 },
  statusBadge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginTop: 12,
  },
  statusBadgeText: { fontWeight: "bold", fontSize: 14 },
  photoActions: { flexDirection: "row", gap: 12, marginTop: 16, width: "100%" },
  retakeBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#1E2A45",
    borderRadius: 12,
  },
  retakeBtnText: { color: "#94A3B8", fontWeight: "bold", fontSize: 14 },
  confirmBtn: {
    flex: 2,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#22D3A5",
    borderRadius: 12,
  },
  confirmBtnText: { color: "#080C18", fontWeight: "900", fontSize: 14 },
  photoPrompt: {
    color: "#475569",
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
  },
  takePhotoBtn: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  takePhotoBtnText: { color: "#080C18", fontWeight: "900", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  tptModal: {
    flex: 1,
    backgroundColor: "#080C18",
    paddingTop: Platform.OS === "ios" ? 52 : 24,
  },
  tptModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tptModalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F59E0B",
    letterSpacing: 2,
  },
  tptCameraWrap: {
    width: "100%",
    aspectRatio: 3 / 4,
    alignSelf: "center",
    position: "relative",
    marginVertical: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  cameraControls: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  camBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  fieldLabel: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "bold",
    color: "#475569",
    letterSpacing: 1,
    marginBottom: 8,
  },
  noteInput: {
    width: "100%",
    backgroundColor: "#080C18",
    color: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#1E2A45",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    textAlignVertical: "top",
    minHeight: 100,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    width: "100%",
    padding: 14,
    backgroundColor: "#1E2A45",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2A45",
  },
  flagRowActive: {
    borderColor: "#EF4444",
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  flagText: { color: "#475569", fontWeight: "bold", fontSize: 14 },
  saveAnnotationBtn: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    width: "100%",
    paddingVertical: 14,
    backgroundColor: "#F59E0B",
    borderRadius: 12,
  },
  saveAnnotationText: {
    color: "#080C18",
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1,
  },
  cameraReference: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 80,
    aspectRatio: 3 / 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#22D3A5",
    overflow: "hidden",
    backgroundColor: "#000",
    zIndex: 10,
  },
  cameraReferenceText: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    color: "#22D3A5",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    paddingVertical: 2,
    zIndex: 11,
  },
  cameraReferenceImg: { width: "100%", height: "100%", opacity: 0.8 },
});
