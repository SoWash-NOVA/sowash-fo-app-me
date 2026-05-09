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

export default function JobDetailScreen({ route, navigation }: any) {
  const { jobId } = route.params || {};

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startingJob, setStartingJob] = useState(false);

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

  // Replace handleStartJob with this:
  const handleViewJob = () => {
    navigation.navigate("SLDMap", { jobId, diagram: job.diagram });
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
              `${m.firstname} ${m.lastname}${m.role === "lead" ? " (Lead)" : ""}`
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
                {safeDate}{safeTime ? `  ${safeTime}` : ""}
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
              <Text style={[styles.value, { flexShrink: 1 }]}>{teamMembers}</Text>
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
        </ScrollView>

        {/* CTA */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity style={styles.startBtn} onPress={handleViewJob}>
            <View style={styles.btnContent}>
              <Text style={styles.startBtnText}>VIEW JOB</Text>
              <Ionicons name="arrow-forward" size={20} color="#080C18" />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
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
  scrollContent: { padding: 20, paddingBottom: 100 },
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
  diagramRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  diagramText: {
    fontSize: 14,
    fontWeight: "bold",
    flexShrink: 1,
  },
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
  startBtnDisabled: { backgroundColor: "#94A3B8", shadowOpacity: 0 },
  btnContent: { flexDirection: "row", alignItems: "center", gap: 10 },
  startBtnText: {
    color: "#080C18",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
});