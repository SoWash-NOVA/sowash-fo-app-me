import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import apiClient from "../api/client";
import { useAuthStore } from "../store/authStore";

interface Job {
  id: number;
  site_name: string;
  job_id?: number | string;
  location: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduled_date: string;
  scheduled_time: string;
  has_diagram: boolean;
  diagram_id: number | null;
}

export default function DashboardScreen({ navigation }: any) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userName = useAuthStore((state) => state.userName);

  const fetchJobs = async () => {
    try {
      const response = await apiClient.get("/jobs/fo"); // Adjusted to SOW route
      console.log(
        "DASHBOARD API RESPONSE:",
        JSON.stringify(response.data, null, 2),
      );
      setJobs(response.data.jobs || response.data || []);
    } catch (error) {
      console.error("Backend fetch failed. Displaying empty queue.", error);
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchJobs();
  }, []);

  // 👇 UPDATED: Matches exact Mideast App status colors from SOW
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#22D3A5"; // Success Green
      case "in_progress":
        return "#F59E0B"; // Warning Gold
      case "cancelled":
        return "#EF4444"; // Danger Red
      case "scheduled":
      default:
        return "#0EA5E9"; // Accent Blue
    }
  };

  const formatDate = (dateStr: string, timeStr: string) => {
    if (!dateStr) return "TBD";
    const datePart = new Date(dateStr).toLocaleDateString();
    return timeStr ? `${datePart} | ${timeStr.substring(0, 5)}` : datePart;
  };

  const renderJobCard = ({ item }: { item: Job }) => {
    // 1. Create safe fallbacks for missing data
    const safeStatus = item?.status || "scheduled"; // Default to scheduled if missing
    const safeId = item?.id || item?.job_id || "N/A"; // Check both id and job_id
    const safeSiteName = item?.site_name || "Unknown Site";
    const safeLocation = item?.location || "Location Not Specified";

    return (
      <BlurView intensity={20} tint="dark" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.jobId}>JOB #{safeId}</Text>
          <View
            style={[
              styles.statusBadge,
              { borderColor: getStatusColor(safeStatus) },
            ]}
          >
            <Text
              style={[styles.statusText, { color: getStatusColor(safeStatus) }]}
            >
              {safeStatus.replace("_", " ").toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.jobTitle}>{safeSiteName}</Text>
        <Text style={styles.jobLocation}>
          <Ionicons name="location-outline" size={12} color="#94A3B8" />{" "}
          {safeLocation}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.jobDate}>
            {formatDate(item?.scheduled_date, item?.scheduled_time)}
          </Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate("JobDetail", { jobId: safeId })}
          >
            <Text
              style={[
                styles.actionButtonText,
                { color: getStatusColor(safeStatus) },
              ]}
            >
              View Details
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={getStatusColor(safeStatus)}
            />
          </TouchableOpacity>
        </View>
      </BlurView>
    );
  };

  return (
    <LinearGradient
      colors={["#080C18", "#0D1120", "#080C18"]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {/* Top Nav */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.openDrawer()}
            style={styles.menuButton}
          >
            <Ionicons name="menu" size={28} color="#0EA5E9" />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>
              WELCOME, {userName ? userName.toUpperCase() : "OPERATOR"}
            </Text>
            <Text style={styles.headerSubtitle}>ACTIVE QUEUE</Text>
          </View>

          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#0EA5E9" />
            <Text style={styles.loadingText}>SYNCING SATELLITE DATA...</Text>
          </View>
        ) : (
          <FlatList
            data={jobs}
            // 👇 FIX: Safely check for item.id, fallback to index if missing
            keyExtractor={(item, index) =>
              item?.id ? item.id.toString() : index.toString()
            }
            renderItem={renderJobCard}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0EA5E9"
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={64}
                  color="#0EA5E9"
                />
                <Text style={styles.emptyText}>NO ACTIVE JOBS ASSIGNED</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 20 : 0,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 158, 11, 0.2)",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 4,
    textShadowColor: "#F59E0B",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginTop: 4,
  },
  logoutButton: {
    padding: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  listContainer: { padding: 20, paddingBottom: 100 },
  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  jobId: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  jobLocation: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 20,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  jobDate: {
    color: "#64748B",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.5)",
  },
  actionButtonText: {
    color: "#F59E0B",
    fontWeight: "bold",
    marginRight: 4,
    letterSpacing: 1,
    fontSize: 12,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 100,
  },
  loadingText: {
    color: "#F59E0B",
    marginTop: 16,
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  emptyText: {
    color: "#3B82F6",
    marginTop: 16,
    letterSpacing: 2,
    fontWeight: "bold",
  },

  menuButton: {
    padding: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },

  headerTextContainer: {
    alignItems: "center", // Centers the text block
  },
});
