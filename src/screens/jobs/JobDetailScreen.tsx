import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import apiClient from "../../api/client";

// 🚀 The strict 10-minute SLA requirement (in seconds)
const REQUIRED_WAIT_SECONDS = 10 * 60;

type JobPhase = "overview" | "at_gate" | "at_panel" | "completed";

export default function JobDetailScreen({ route, navigation }: any) {
  const { jobId } = route.params || {};

  // --- EXISTING JOB STATE ---
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // --- NEW EXECUTION STATE ---
  const [phase, setPhase] = useState<JobPhase>("overview");
  const [gateTime, setGateTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(REQUIRED_WAIT_SECONDS);

  // --- EXISTING DATA FETCH ---
  useEffect(() => {
    if (!jobId) {
      Alert.alert("Error", "No Job ID provided.");
      navigation.goBack();
      return;
    }

    const fetchJobDetails = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(`/jobs/${jobId}`);
        setJob(response.data);
      } catch (error: any) {
        console.error("Job Fetch Error:", error);
        Toast.show({
          type: "error",
          text1: "Sync Error",
          text2: "Could not load job details.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchJobDetails();
  }, [jobId, navigation]);

  // --- NEW: LIVE COUNTDOWN TIMER ENGINE ---
  useEffect(() => {
    if (phase === "at_gate" && gateTime) {
      const interval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - gateTime) / 1000);
        const remaining = Math.max(0, REQUIRED_WAIT_SECONDS - elapsedSeconds);

        setTimeRemaining(remaining);

        if (remaining === 0) {
          clearInterval(interval);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [phase, gateTime]);

  // --- ACTION HANDLERS ---
  const handleViewJob = () => {
    navigation.navigate("SLDMap", { jobId, diagram: job.diagram });
  };

  const handleReachGate = () => {
    Alert.alert(
      "Confirm Arrival",
      "Are you at the facility gate? The 10-minute transit and safety timer will begin.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Mark Gate",
          onPress: () => {
            setGateTime(Date.now());
            setPhase("at_gate");
            Toast.show({
              type: "success",
              text1: "Gate Reached",
              text2: "Transit timer activated.",
            });
          },
        },
      ],
    );
  };

  const handleReachPanel = () => {
    if (timeRemaining > 0) return; // Strict lock
    setPhase("at_panel");
    Toast.show({
      type: "success",
      text1: "Panel Reached",
      text2: "FSR and Camera unlocked.",
    });
  };

  const handleSubmitJob = () => {
    setPhase("completed");
    Toast.show({
      type: "success",
      text1: "Job Complete",
      text2: "FSR Submitted successfully.",
    });
    setTimeout(() => navigation.goBack(), 1500);
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <LinearGradient colors={["#080C18", "#0D1120"]} style={styles.centered}>
        <ActivityIndicator size="large" color="#0EA5E9" />
        <Text style={styles.loadingText}>LOADING JOB DATA...</Text>
      </LinearGradient>
    );
  }

  if (!job) return null;

  // --- SAFE DATA MAPPING ---
  const safeId = job.job?.id || jobId;
  const safeSiteName = job.job?.site_name || "Site Name Not Provided";
  const safeClientName = job.job?.client_name || "Client Not Provided";
  const safeDate = job.job?.scheduled_date
    ? new Date(job.job.scheduled_date).toLocaleDateString()
    : "Date Pending";
  const safeTime = job.job?.scheduled_time || "";
  const safePanelCount = job.job?.panel_count ?? "—";
  const safeSystemSize = job.job?.system_size ?? "—";
  const safeLocation = job.job?.location || "—";
  const safeTeamName = job.job?.team_name || "—";
  const teamMembers =
    Array.isArray(job.members) && job.members.length > 0
      ? job.members
          .map(
            (m: any) =>
              `${m.firstname} ${m.lastname}${m.role === "lead" ? " (Lead)" : ""}`,
          )
          .join(", ")
      : "Team Not Assigned";
  const adminNotes =
    Array.isArray(job.notes) && job.notes.length > 0
      ? job.notes.map((n: any) => n.note || n).join("\n")
      : "No notes for this site.";
  const hasDiagram = !!job.diagram;

  return (
    <LinearGradient colors={["#080C18", "#0D1120"]} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#0EA5E9" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>JOB DETAILS</Text>
            <Text style={styles.headerSubtitle}>JOB #{safeId}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Site Information */}
          <BlurView intensity={30} tint="dark" style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="business" size={20} color="#0EA5E9" />
              <Text style={styles.cardTitle}>SITE INFORMATION</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Site Name</Text>
              <Text style={styles.value}>{safeSiteName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Client</Text>
              <Text style={styles.value}>{safeClientName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Location</Text>
              <Text style={styles.value}>{safeLocation}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Scheduled</Text>
              <Text style={styles.value}>
                {safeDate}
                {safeTime ? `  ${safeTime}` : ""}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Panel Count</Text>
              <Text style={styles.value}>{safePanelCount}</Text>
            </View>
            <View style={[styles.infoRow, { marginBottom: 0 }]}>
              <Text style={styles.label}>System Size</Text>
              <Text style={styles.value}>{safeSystemSize} kW</Text>
            </View>
          </BlurView>

          {/* Team */}
          <BlurView intensity={30} tint="dark" style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="people" size={20} color="#0EA5E9" />
              <Text style={styles.cardTitle}>TEAM</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Team Name</Text>
              <Text style={styles.value}>{safeTeamName}</Text>
            </View>
            <View style={[styles.infoRow, { marginBottom: 0 }]}>
              <Text style={styles.label}>Members</Text>
              <Text style={[styles.value, { flexShrink: 1 }]}>
                {teamMembers}
              </Text>
            </View>
          </BlurView>

          {/* Diagram status */}
          <BlurView intensity={30} tint="dark" style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="map" size={20} color="#0EA5E9" />
              <Text style={styles.cardTitle}>SITE DIAGRAM</Text>
            </View>
            <View style={styles.diagramRow}>
              <Ionicons
                name={hasDiagram ? "checkmark-circle" : "close-circle"}
                size={20}
                color={hasDiagram ? "#22D3A5" : "#EF4444"}
              />
              <Text
                style={[
                  styles.diagramText,
                  { color: hasDiagram ? "#22D3A5" : "#EF4444" },
                ]}
              >
                {hasDiagram
                  ? `${job.diagram.title} — ${job.diagram.points?.length ?? 0} pins loaded`
                  : "No diagram assigned to this site"}
              </Text>
            </View>
          </BlurView>

          {/* Admin Notes */}
          <BlurView
            intensity={30}
            tint="dark"
            style={[styles.card, styles.alertCard]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={20} color="#F59E0B" />
              <Text style={[styles.cardTitle, { color: "#F59E0B" }]}>
                ADMIN NOTES
              </Text>
            </View>
            <Text style={styles.alertText}>{adminNotes}</Text>
          </BlurView>

          {/* 🚀 NEW: EXECUTION WORKFLOW PROTOCOL 🚀 */}
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

            {/* 2. REACH PANEL (TIMER) */}
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
                        ? "#F59E0B"
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
                  <Text style={styles.timerLabel}>
                    MANDATORY TRANSIT/SAFETY WAIT
                  </Text>
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
                    <Ionicons
                      name={timeRemaining > 0 ? "lock-closed" : "lock-open"}
                      size={18}
                      color={timeRemaining > 0 ? "#94A3B8" : "#080C18"}
                      style={{ marginRight: 8 }}
                    />
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

            {/* 3. FSR & PHOTOS */}
            <BlurView
              intensity={20}
              tint="dark"
              style={[
                styles.workflowCard,
                phase !== "at_panel" &&
                  phase !== "completed" &&
                  styles.cardDisabled,
                phase === "completed" && styles.cardCompleted,
              ]}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name="camera"
                  size={20}
                  color={
                    phase === "at_panel"
                      ? "#0EA5E9"
                      : phase === "completed"
                        ? "#10B981"
                        : "#64748B"
                  }
                />
                <Text style={styles.cardTitle}>3. EXECUTION & FSR</Text>
              </View>
              <Text style={styles.cardDescription}>
                Capture Before/After photos and complete the Field Service
                Report.
              </Text>

              {phase === "at_panel" && (
                <View style={styles.fsrContainer}>
                  <View style={styles.photoGrid}>
                    <TouchableOpacity style={styles.photoBtn}>
                      <Ionicons
                        name="camera-outline"
                        size={28}
                        color="#0EA5E9"
                      />
                      <Text style={styles.photoBtnText}>BEFORE PHOTOS</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoBtn}>
                      <Ionicons
                        name="camera-outline"
                        size={28}
                        color="#0EA5E9"
                      />
                      <Text style={styles.photoBtnText}>AFTER PHOTOS</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.fsrFormBtn}>
                    <Ionicons
                      name="document-text-outline"
                      size={20}
                      color="#F8FAFC"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.fsrFormBtnText}>FILL FSR FORM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        marginTop: 24,
                        backgroundColor: "#10B981",
                        borderColor: "#10B981",
                      },
                    ]}
                    onPress={handleSubmitJob}
                  >
                    <Text style={[styles.actionBtnText, { color: "#080C18" }]}>
                      SUBMIT JOB
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {phase === "completed" && (
                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#10B981"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.completedText}>FSR SUBMITTED</Text>
                </View>
              )}
            </BlurView>
          </View>
        </ScrollView>

        {/* Existing CTA Footer */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity style={styles.startBtn} onPress={handleViewJob}>
            <View style={styles.btnContent}>
              <Text style={styles.startBtnText}>VIEW SITE DIAGRAM</Text>
              <Ionicons name="map-outline" size={20} color="#080C18" />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // Existing Styles
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    color: "#0EA5E9",
    marginTop: 16,
    letterSpacing: 2,
    fontWeight: "bold",
  },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A45",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(14, 165, 233, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.3)",
  },
  headerTextContainer: { alignItems: "center" },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#F1F5F9",
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    letterSpacing: 1,
  },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: "rgba(13, 17, 32, 0.7)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E2A45",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A45",
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0EA5E9",
    marginLeft: 8,
    letterSpacing: 1,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  label: { fontSize: 14, color: "#94A3B8", fontWeight: "500" },
  value: {
    fontSize: 14,
    color: "#F1F5F9",
    fontWeight: "bold",
    flex: 1,
    textAlign: "right",
    marginLeft: 20,
  },
  diagramRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  diagramText: { fontSize: 14, fontWeight: "bold", flexShrink: 1 },
  alertCard: {
    borderColor: "rgba(245, 158, 11, 0.4)",
    backgroundColor: "rgba(245, 158, 11, 0.05)",
  },
  alertText: { fontSize: 14, color: "#F1F5F9", lineHeight: 22 },
  ctaContainer: {
    padding: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#1E2A45",
    backgroundColor: "#0D1120",
  },
  startBtn: {
    backgroundColor: "#22D3A5",
    paddingVertical: 18,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#22D3A5",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  btnContent: { flexDirection: "row", alignItems: "center", gap: 10 },
  startBtnText: {
    color: "#080C18",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },

  // New Workflow Styles
  workflowContainer: { marginTop: 10 },
  workflowTitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
    marginLeft: 4,
    marginTop: 20,
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
  actionBtnLocked: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  actionBtnReady: { backgroundColor: "#10B981", borderColor: "#10B981" },
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
  fsrContainer: { marginTop: 10 },
  photoGrid: { flexDirection: "row", gap: 12, marginBottom: 16 },
  photoBtn: {
    flex: 1,
    height: 100,
    backgroundColor: "rgba(14, 165, 233, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.2)",
    borderRadius: 12,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoBtnText: {
    color: "#0EA5E9",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
    letterSpacing: 1,
  },
  fsrFormBtn: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E2A45",
  },
  fsrFormBtnText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
